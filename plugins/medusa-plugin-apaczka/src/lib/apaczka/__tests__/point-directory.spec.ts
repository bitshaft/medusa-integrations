import type { ApaczkaPoint } from "../client"
import { ApaczkaPointDirectory, type StoredPointQuery } from "../point-directory"
import { MemoryPointStore } from "./memory-point-store"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const point = (id: string): ApaczkaPoint => ({
  type: "INPOST",
  subtype: "parcel_locker",
  name: id,
  foreign_address_id: id,
  address: {
    line1: `Ulica ${id}`,
    postal_code: "00-001",
    city: "Warszawa",
    country_code: "PL",
    latitude: "52.23",
    longitude: "21.01",
  },
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Lets background refreshes run to the end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const query: StoredPointQuery = { type: "INPOST", countryCode: "PL", terms: [], limit: 50 }

function setup(options: { store?: MemoryPointStore; source?: string; onSleep?: () => Promise<void> | void } = {}) {
  let now = 1_000_000
  const store = options.store ?? new MemoryPointStore()
  const getPoints = jest.fn().mockResolvedValue([point("WAW01M")])
  const logger = { warn: jest.fn(), info: jest.fn() }
  const directory = new ApaczkaPointDirectory({ getPoints }, store, {
    source: options.source ?? "production",
    refreshAfterMs: 6 * HOUR,
    retryAfterMs: 15 * MINUTE,
    waitForSyncMs: 10_000,
    logger,
    now: () => now,
    sleep: async (ms) => {
      now += ms
      await options.onSleep?.()
    },
  })
  return { directory, store, getPoints, logger, advance: (ms: number) => (now += ms), now: () => now }
}

const ids = (points: ApaczkaPoint[]) => points.map((p) => p.foreign_address_id)

describe("ApaczkaPointDirectory", () => {
  it("makes the first search wait for the list, then answers from the database", async () => {
    const { directory, getPoints, logger } = setup()
    expect(ids(await directory.search(query))).toEqual(["WAW01M"])
    expect(ids(await directory.search(query))).toEqual(["WAW01M"])
    expect(getPoints).toHaveBeenCalledTimes(1)
    expect(getPoints).toHaveBeenCalledWith("INPOST", { country_code: "PL" })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Stored 1 INPOST parcel points for PL"))
  })

  it("answers from the stored list while a stale one refreshes in the background", async () => {
    const { directory, getPoints, advance } = setup()
    await directory.search(query)
    advance(6 * HOUR)

    const refresh = deferred<ApaczkaPoint[]>()
    getPoints.mockReturnValueOnce(refresh.promise)
    expect(ids(await directory.search(query))).toEqual(["WAW01M"])
    expect(getPoints).toHaveBeenCalledTimes(2)

    refresh.resolve([point("NEW01M")])
    await settle()
    expect(ids(await directory.search(query))).toEqual(["NEW01M"])
    expect(getPoints).toHaveBeenCalledTimes(2)
  })

  it("starts one refresh for concurrent searches", async () => {
    const { directory, getPoints, advance } = setup()
    await directory.search(query)
    advance(7 * HOUR)

    const refresh = deferred<ApaczkaPoint[]>()
    getPoints.mockReturnValueOnce(refresh.promise)
    await Promise.all([directory.search(query), directory.search(query), directory.find("INPOST", "PL", "WAW01M")])
    expect(getPoints).toHaveBeenCalledTimes(2)
    refresh.resolve([point("WAW01M")])
    await settle()
  })

  it("keeps the stored list when a refresh fails, and tries again after 15 minutes", async () => {
    const { directory, getPoints, store, advance, logger } = setup()
    await directory.search(query)
    advance(6 * HOUR)

    getPoints.mockRejectedValueOnce(new Error("Apaczka is down"))
    expect(ids(await directory.search(query))).toEqual(["WAW01M"])
    await settle()
    expect((await store.getStatus("INPOST", "PL"))?.status).toBe("failed")
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Apaczka is down"))

    advance(MINUTE)
    expect(ids(await directory.search(query))).toEqual(["WAW01M"])
    expect(getPoints).toHaveBeenCalledTimes(2)

    advance(15 * MINUTE)
    await directory.search(query)
    await settle()
    expect(getPoints).toHaveBeenCalledTimes(3)
    expect((await store.getStatus("INPOST", "PL"))?.status).toBe("idle")
  })

  it("fails without calling Apaczka again when nothing is stored and the last sync just failed", async () => {
    const { directory, getPoints, store, logger } = setup()
    getPoints.mockRejectedValueOnce(new Error("Invalid signature"))
    // The store API is public: a search never says why (here: the keys don't work).
    const unavailable = { message: "Parcel points for INPOST are not available right now. Try again in a few minutes." }
    await expect(directory.search(query)).rejects.toMatchObject(unavailable)
    await expect(directory.search(query)).rejects.toMatchObject(unavailable)
    expect(getPoints).toHaveBeenCalledTimes(1)
    // The cause is kept for the admin and the log.
    expect((await store.getStatus("INPOST", "PL"))?.error).toBe("Invalid signature")
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Invalid signature"))
  })

  it("replaces a list stored from another source before using it", async () => {
    const demo = setup({ source: "demo" })
    demo.getPoints.mockResolvedValueOnce([point("DEMOWAR01")])
    await demo.directory.search(query)

    const live = setup({ store: demo.store, source: "production" })
    live.getPoints.mockResolvedValueOnce([point("WAW41N")])
    expect(ids(await live.directory.search(query))).toEqual(["WAW41N"])
    expect(live.getPoints).toHaveBeenCalledTimes(1)
  })

  it("waits for a sync running in another process instead of starting its own", async () => {
    const store = new MemoryPointStore()
    const other = new Date(1_000_000)
    await store.tryLock("INPOST", "PL", other, 10 * MINUTE)

    const { directory, getPoints } = setup({
      store,
      // The other process finishes while this one waits.
      onSleep: async () => {
        await store.replace("INPOST", "PL", [point("OTHER01")], other)
        await store.finish("INPOST", "PL", { now: other, source: "production", count: 1 })
      },
    })
    expect(ids(await directory.search(query))).toEqual(["OTHER01"])
    expect(getPoints).not.toHaveBeenCalled()
  })

  it("takes over a sync that has been running for too long", async () => {
    const store = new MemoryPointStore()
    await store.tryLock("INPOST", "PL", new Date(1_000_000 - 11 * MINUTE), 10 * MINUTE)
    const { directory, getPoints } = setup({ store })
    expect(ids(await directory.search(query))).toEqual(["WAW01M"])
    expect(getPoints).toHaveBeenCalledTimes(1)
  })

  it("gives up waiting for another process after waitForSyncMs", async () => {
    const store = new MemoryPointStore()
    await store.tryLock("INPOST", "PL", new Date(1_000_000), 10 * MINUTE)
    const { directory } = setup({ store })
    await expect(directory.search(query)).rejects.toThrow("not available right now")
  })

  it("refresh() syncs now even when the list is fresh", async () => {
    const { directory, getPoints, advance } = setup()
    await directory.search(query)
    advance(5 * MINUTE)
    getPoints.mockResolvedValueOnce([point("WAW01M"), point("WAW02M")])
    const status = await directory.refresh("INPOST", "PL")
    expect(getPoints).toHaveBeenCalledTimes(2)
    expect(status).toMatchObject({ status: "idle", point_count: 2, source: "production" })
  })

  it("refresh() is refused within 5 minutes of the last attempt", async () => {
    const { directory, getPoints, advance } = setup()
    await directory.search(query)
    advance(2 * MINUTE)
    await expect(directory.refresh("INPOST", "PL")).rejects.toMatchObject({
      type: "not_allowed",
      message: expect.stringContaining("Try again in 3 min"),
    })
    expect(getPoints).toHaveBeenCalledTimes(1)

    // A failed attempt counts too.
    advance(3 * MINUTE)
    getPoints.mockRejectedValueOnce(new Error("Apaczka is down"))
    await expect(directory.refresh("INPOST", "PL")).rejects.toThrow()
    await expect(directory.refresh("INPOST", "PL")).rejects.toMatchObject({ type: "not_allowed" })
    expect(getPoints).toHaveBeenCalledTimes(2)
  })

  it("refresh() tells the admin why a sync failed", async () => {
    const { directory, getPoints } = setup()
    getPoints.mockRejectedValueOnce(new Error("Invalid signature"))
    await expect(directory.refresh("INPOST", "PL")).rejects.toThrow(
      "Could not sync INPOST parcel points: Invalid signature"
    )
  })
})
