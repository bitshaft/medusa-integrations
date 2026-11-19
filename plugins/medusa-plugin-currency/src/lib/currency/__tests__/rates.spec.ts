import { DEFAULT_RULE } from "../settings"
import { crossRate, lookupRates, type RateStore, type RateTable, resolveRate } from "../rates"
import { NbpRateProvider, nextPublication, toRateTable, warsawTime } from "../rates/nbp"

const nbpTable = (date: string, no: string, rates: Record<string, number>) => ({
  table: "A",
  no,
  effectiveDate: date,
  rates: Object.entries(rates).map(([code, mid]) => ({ currency: code, code, mid })),
})

/** A fetch that answers NBP paths from a map; anything else is a 404 "Brak danych". */
function fakeNbp(routes: Record<string, unknown>) {
  const calls: string[] = []
  const fetch = (async (url: string) => {
    const path = String(url).replace("https://nbp.test/api", "").replace("?format=json", "")
    calls.push(path)
    if (path in routes) {
      const body = routes[path]
      if (body instanceof Error) throw body
      return new Response(JSON.stringify(body), { status: 200 })
    }
    return new Response("404 NotFound - Not Found - Brak danych", { status: 404 })
  }) as unknown as typeof globalThis.fetch
  const provider = new NbpRateProvider({
    baseUrl: "https://nbp.test/api",
    timeoutMs: 1000,
    fetch,
    sleep: async () => {},
  })
  return { provider, calls }
}

function memoryStore(initial?: { table: RateTable; checked_at: Date }): RateStore & { saved: RateTable[] } {
  let current = initial ?? null
  const saved: RateTable[] = []
  return {
    saved,
    latestTable: async () => current,
    saveTable: async (table, checkedAt) => {
      saved.push(table)
      current = { table, checked_at: checkedAt }
    },
  }
}

const TABLE: RateTable = {
  provider: "nbp",
  table: "225/A/NBP/2026",
  date: "2026-11-20",
  base: "PLN",
  rates: { EUR: "4.4165", USD: "4.0176", HUF: "0.011969", CZK: "0.1772" },
}

describe("NBP table A", () => {
  it("reads the table number, date and rates as decimal text", () => {
    const table = toRateTable(nbpTable("2026-11-19", "225/A/NBP/2026", { EUR: 4.4165, HUF: 0.011969, XXX: 0 }))
    expect(table).toEqual({
      provider: "nbp",
      table: "225/A/NBP/2026",
      date: "2026-11-19",
      base: "PLN",
      rates: { EUR: "4.4165", HUF: "0.011969" },
    })
    expect(() => toRateTable({ no: 1 } as never)).toThrow("unexpected format")
  })

  it("finds the last table before a day without quotes (weekend)", async () => {
    const { provider, calls } = fakeNbp({
      "/exchangerates/tables/A/2026-11-08/2026-11-22/": [
        nbpTable("2026-11-19", "225/A/NBP/2026", { EUR: 4.4165 }),
        nbpTable("2026-11-20", "226/A/NBP/2026", { EUR: 4.42 }),
      ],
    })
    const table = await provider.on("2026-11-22")
    expect(table).toMatchObject({ table: "226/A/NBP/2026", date: "2026-11-20" })
    expect(calls).toEqual(["/exchangerates/tables/A/2026-11-08/2026-11-22/"])
  })

  it("reports a day range with no table as no data, and an outage as unavailable", async () => {
    await expect(fakeNbp({}).provider.on("2026-11-22")).rejects.toMatchObject({ code: "no_data" })
    const down = fakeNbp({ "/exchangerates/tables/A/": new Error("ECONNRESET") })
    await expect(down.provider.latest()).rejects.toMatchObject({ code: "unavailable" })
  })

  it("expects the next table on the next working day after noon in Warsaw", () => {
    // Thursday → Friday; Friday → Monday (no tables on weekends).
    expect(nextPublication("2026-11-19").toISOString()).toBe("2026-11-20T11:30:00.000Z")
    expect(nextPublication("2026-11-20").toISOString()).toBe("2026-11-23T11:30:00.000Z")
    // Summer time: 12:30 in Warsaw is 10:30 UTC.
    expect(warsawTime("2026-07-01", 12, 30).toISOString()).toBe("2026-07-01T10:30:00.000Z")
  })
})

describe("cross rates", () => {
  it("quotes a currency in another base through the table's currency", () => {
    expect(crossRate(TABLE, "pln", "eur")).toBe("4.4165")
    // 1 EUR = 4.4165 / 4.0176 USD
    expect(crossRate(TABLE, "usd", "eur")).toBe("1.09928813")
    // 1 HUF in EUR, and 1 EUR in CZK
    expect(crossRate(TABLE, "eur", "huf")).toBe("0.00271006")
    expect(crossRate(TABLE, "czk", "eur")).toBe("24.9238149")
    expect(crossRate(TABLE, "eur", "pln")).toBe("0.22642364")
    expect(crossRate(TABLE, "pln", "gbp")).toBeNull()
  })
})

describe("the rate cache", () => {
  const friday = { table: { ...TABLE }, checked_at: new Date("2026-11-20T11:40:00Z") }

  it("keeps a table until the next one is due, also over a weekend", async () => {
    const { provider, calls } = fakeNbp({})
    const store = memoryStore(friday)
    const lookup = await lookupRates({ provider, store, now: new Date("2026-11-22T18:00:00Z") })
    expect(lookup).toMatchObject({
      status: "fresh",
      table: { date: "2026-11-20" },
      next_expected: "2026-11-23T11:30:00.000Z",
    })
    expect(calls).toEqual([])
  })

  it("asks again once a newer table is due", async () => {
    const { provider, calls } = fakeNbp({
      "/exchangerates/tables/A/": [nbpTable("2026-11-23", "227/A/NBP/2026", { EUR: 4.43 })],
    })
    const store = memoryStore(friday)
    const lookup = await lookupRates({ provider, store, now: new Date("2026-11-23T12:00:00Z") })
    expect(lookup).toMatchObject({ status: "fresh", table: { table: "227/A/NBP/2026" } })
    expect(calls).toEqual(["/exchangerates/tables/A/"])
    expect(store.saved).toHaveLength(1)
  })

  it("does not ask again within half an hour on a holiday (the same table comes back)", async () => {
    const { provider, calls } = fakeNbp({})
    const store = memoryStore({ table: { ...TABLE }, checked_at: new Date("2026-11-23T12:00:00Z") })
    await lookupRates({ provider, store, now: new Date("2026-11-23T12:20:00Z") })
    expect(calls).toEqual([])
  })

  it("falls back to the saved table, marked stale, when the source is down", async () => {
    const { provider } = fakeNbp({ "/exchangerates/tables/A/": new Error("timeout") })
    const lookup = await lookupRates({ provider, store: memoryStore(friday), now: new Date("2026-11-24T09:00:00Z") })
    expect(lookup).toMatchObject({
      status: "stale",
      table: { date: "2026-11-20" },
      error: expect.stringContaining("NBP"),
    })

    // A refresh that fails before the next table is due changes nothing: the table is still the newest.
    const early = await lookupRates({
      provider,
      store: memoryStore(friday),
      now: new Date("2026-11-21T09:00:00Z"),
      refresh: true,
    })
    expect(early.status).toBe("fresh")
  })

  it("is unavailable with no answer and nothing saved", async () => {
    const { provider } = fakeNbp({ "/exchangerates/tables/A/": new Error("down") })
    expect(await lookupRates({ provider, store: memoryStore() })).toMatchObject({ status: "unavailable", table: null })
  })
})

describe("resolveRate", () => {
  const lookup = { table: TABLE, status: "fresh" as const, checked_at: null, next_expected: null, error: null }

  it("uses a fixed rate as entered, without a table", () => {
    const result = resolveRate({
      base: "pln",
      target: "eur",
      rule: { ...DEFAULT_RULE, mode: "fixed", fixedRate: "4.00" },
      lookup: { ...lookup, table: null, status: "unavailable" },
      allowStale: false,
    })
    expect(result).toEqual({
      ok: true,
      rate: { currency: "eur", mode: "fixed", rate: "4", margin: "0", effective: "4", source: null },
    })
    expect(
      resolveRate({ base: "pln", target: "eur", rule: { ...DEFAULT_RULE, mode: "fixed" }, lookup, allowStale: false })
    ).toEqual({
      ok: false,
      reason: "fixed_rate_missing",
    })
  })

  it("takes the API rate with its table, and the margin only in margin mode", () => {
    const api = resolveRate({
      base: "pln",
      target: "eur",
      rule: { ...DEFAULT_RULE, marginPercent: "3" },
      lookup,
      allowStale: false,
    })
    expect(api).toMatchObject({
      ok: true,
      rate: { rate: "4.4165", margin: "0", source: { table: "225/A/NBP/2026", date: "2026-11-20", stale: false } },
    })
    const margin = resolveRate({
      base: "pln",
      target: "eur",
      rule: { ...DEFAULT_RULE, mode: "api_margin", marginPercent: "3" },
      lookup,
      allowStale: false,
    })
    expect(margin).toMatchObject({ ok: true, rate: { rate: "4.4165", margin: "3", effective: "4.28786408" } })
  })

  it("uses a stale table only when asked to", () => {
    const stale = { ...lookup, status: "stale" as const }
    expect(resolveRate({ base: "pln", target: "eur", rule: DEFAULT_RULE, lookup: stale, allowStale: false })).toEqual({
      ok: false,
      reason: "rates_unavailable",
    })
    expect(
      resolveRate({ base: "pln", target: "eur", rule: DEFAULT_RULE, lookup: stale, allowStale: true })
    ).toMatchObject({
      ok: true,
      rate: { source: { stale: true } },
    })
    expect(resolveRate({ base: "pln", target: "gbp", rule: DEFAULT_RULE, lookup, allowStale: false })).toEqual({
      ok: false,
      reason: "rate_missing",
    })
  })
})
