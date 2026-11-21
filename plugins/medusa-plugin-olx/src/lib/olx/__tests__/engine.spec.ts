import { HttpTimeoutError } from "../kit/http"
import type { OlxAdvert, OlxApi, OlxCommand, OlxPage } from "../client"
import { OlxRefusedError } from "../client"
import {
  activateAdvert,
  checkStock,
  deactivateAdvert,
  type AdvertStore,
  type Engine,
  publishAdvert,
  resolvePublishing,
  runSync,
  syncFeed,
  UNCONFIRMED_AFTER_MS,
  updateAdvert,
} from "../engine"
import type { AdvertInput, AdvertRecord, SyncCursor } from "../types"

const input: AdvertInput = {
  title: "Marynarka wełniana vintage rozmiar 50",
  description:
    "Włoska marynarka z flaneli wełnianej, stan bardzo dobry, bez przetarć i plam. Wymiary podajemy w wiadomości po zakupie.",
  price: "399.00",
  negotiable: false,
  category_id: 9001,
  attributes: [{ code: "state", value: "used" }],
  images: ["https://cdn.example.com/a.jpg"],
  city_id: 8001,
  district_id: null,
  contact_name: "Sklep",
  contact_phone: null,
  advertiser_type: "business",
}

/** A store with the same rules as the module: one row per variant, one claim at a time. */
function fakeStore() {
  const rows = new Map<string, AdvertRecord>()
  let cursor: SyncCursor | null = null
  let next = 1
  const store: AdvertStore = {
    getRecord: async (id) => rows.get(id) ?? null,
    findForVariant: async (variant) => [...rows.values()].find((row) => row.variant_id === variant) ?? null,
    findByOlxId: async (id) => [...rows.values()].find((row) => row.olx_advert_id === id) ?? null,
    listLive: async (ids) =>
      [...rows.values()].filter(
        (row) =>
          ["new", "active"].includes(row.status) && !row.pending_deactivate && (!ids || ids.includes(row.variant_id))
      ),
    listPublishing: async () => [...rows.values()].filter((row) => row.status === "publishing"),
    listPendingDeactivations: async () => [...rows.values()].filter((row) => row.pending_deactivate),
    createRecord: async (data) => {
      if ([...rows.values()].some((row) => row.variant_id === data.variant_id)) {
        throw new Error("unique violation")
      }
      const row: AdvertRecord = {
        id: `olxad_${next++}`,
        variant_id: data.variant_id,
        product_id: data.product_id,
        demo: false,
        olx_advert_id: null,
        status: "publishing",
        url: null,
        valid_to: null,
        title: data.payload.title,
        price: data.payload.price,
        payload: data.payload,
        last_error: null,
        pending_deactivate: false,
        pending_success: false,
        sold_channel: null,
        sold_at: null,
        claimed_at: null,
        write_started_at: null,
        synced_at: null,
      }
      rows.set(row.id, row)
      return { ...row }
    },
    patchRecord: async (id, patch) => {
      const row = { ...rows.get(id)!, ...patch }
      rows.set(id, row)
      return { ...row }
    },
    claimRecord: async (id, now, staleBefore) => {
      const row = rows.get(id)
      if (!row || (row.claimed_at && row.claimed_at >= staleBefore)) return null
      row.claimed_at = now
      return { ...row }
    },
    readCursor: async () => cursor,
    saveCursor: async (value) => {
      cursor = value
    },
  }
  return { store, rows, cursor: () => cursor }
}

/** An OLX whose answers a test can change. */
function fakeApi() {
  const adverts = new Map<string, OlxAdvert & { external_id: string }>()
  const calls = { create: 0, update: 0, commands: [] as OlxCommand[] }
  const behaviour: {
    create?: () => void
    /** The request reaches OLX, and then the answer is lost. */
    createLost?: boolean
    update?: () => void
    command?: () => void
    pages: OlxPage[]
    feedError?: Error
  } = { pages: [] }
  let id = 500
  const api = {
    me: async () => ({ id: 1 }),
    createAdvert: async (_input: AdvertInput, externalId: string) => {
      calls.create++
      behaviour.create?.()
      const advert = { id: id++, status: "new", url: "https://olx.test/a", valid_to: null, external_id: externalId }
      adverts.set(String(advert.id), advert)
      if (behaviour.createLost) throw new HttpTimeoutError("/adverts", 1000)
      return advert
    },
    updateAdvert: async (advertId: string) => {
      calls.update++
      behaviour.update?.()
      return adverts.get(advertId)!
    },
    getAdvert: async (advertId: string) => adverts.get(advertId) ?? null,
    findByExternalId: async (externalId: string) =>
      [...adverts.values()].find((advert) => advert.external_id === externalId) ?? null,
    command: async (advertId: string, command: OlxCommand) => {
      calls.commands.push(command)
      behaviour.command?.()
      const advert = adverts.get(advertId)
      if (advert) advert.status = command.command === "activate" ? "active" : "removed_by_user"
    },
    advertChanges: async () => {
      if (behaviour.feedError) {
        const error = behaviour.feedError
        behaviour.feedError = undefined
        throw error
      }
      return behaviour.pages.shift() ?? { ids: [], hasMore: false, nextCursor: null }
    },
  } as unknown as OlxApi
  return { api, adverts, calls, behaviour }
}

function setup(stock: Record<string, boolean | null> = {}) {
  const fake = fakeStore()
  const olx = fakeApi()
  const clock = { now: new Date("2026-11-21T12:00:00Z") }
  const warnings: string[] = []
  const engine: Engine = {
    store: fake.store,
    api: olx.api,
    logger: { warn: (message) => warnings.push(message) },
    safety: async () => ({}),
    availability: async (ids) => new Map(ids.map((id) => [id, id in stock ? stock[id] : true])),
    now: () => clock.now,
  }
  return { engine, ...fake, ...olx, clock, stock, warnings }
}

const publish = (engine: Engine, variant = "var_1") =>
  publishAdvert(engine, { variant_id: variant, product_id: "prod_1", advert: input })

describe("publishing", () => {
  it("creates the advert with its own id as external_id", async () => {
    const t = setup()
    const result = await publish(t.engine)
    expect(result.result).toBe("published")
    const row = [...t.rows.values()][0]
    expect(row).toMatchObject({ olx_advert_id: "500", status: "new", claimed_at: null, write_started_at: null })
    expect(t.adverts.get("500")?.external_id).toBe(row.id)
  })

  it("sends nothing when the form breaks OLX's rules", async () => {
    const t = setup()
    const result = await publishAdvert(t.engine, {
      variant_id: "var_1",
      product_id: "prod_1",
      advert: { ...input, title: "Krótki" },
    })
    expect(result).toEqual({ result: "invalid", issues: [{ field: "title", code: "too_short" }] })
    expect(t.calls.create).toBe(0)
    expect(t.rows.size).toBe(0)
  })

  it("does not offer an item that cannot be bought in the store", async () => {
    const t = setup({ var_1: false })
    expect(await publish(t.engine)).toEqual({ result: "conflict", code: "out_of_stock" })
    expect(t.calls.create).toBe(0)
  })

  it("refuses a second advert for the same variant", async () => {
    const t = setup()
    await publish(t.engine)
    expect(await publish(t.engine)).toEqual({ result: "conflict", code: "exists" })
    expect(t.calls.create).toBe(1)
  })

  it("two publishes at once create one advert", async () => {
    const t = setup()
    const results = await Promise.all([publish(t.engine), publish(t.engine)])
    expect(t.calls.create).toBe(1)
    expect(results.map((r) => r.result).sort()).toEqual(["conflict", "published"])
  })

  it("a refusal from OLX is final and can be published again on the same row", async () => {
    const t = setup()
    t.behaviour.create = () => {
      throw new OlxRefusedError(400, "Bad category", [{ field: "category_id", detail: "Bad category" }])
    }
    const first = await publish(t.engine)
    expect(first).toMatchObject({ result: "refused", message: "Bad category" })
    expect([...t.rows.values()][0]).toMatchObject({ status: "failed", write_started_at: null, claimed_at: null })

    t.behaviour.create = undefined
    expect((await publish(t.engine)).result).toBe("published")
    expect(t.rows.size).toBe(1)
  })

  it("a create whose answer was lost is not sent again: the sync finds it on OLX", async () => {
    const t = setup()
    t.behaviour.createLost = true
    expect((await publish(t.engine)).result).toBe("unconfirmed")
    const row = [...t.rows.values()][0]
    expect(row.status).toBe("publishing")

    // Asking again while it is unresolved does not write.
    expect(await publish(t.engine)).toEqual({ result: "conflict", code: "in_progress" })
    expect(t.calls.create).toBe(1)

    await resolvePublishing(t.engine)
    expect(t.rows.get(row.id)).toMatchObject({ olx_advert_id: "500", status: "new", write_started_at: null })
    expect(t.calls.create).toBe(1)
  })

  it("a lost create that never reached OLX becomes publishable only after the wait", async () => {
    const t = setup()
    t.behaviour.create = () => {
      throw new HttpTimeoutError("/adverts", 1000)
    }
    await publish(t.engine)
    const id = [...t.rows.keys()][0]

    await resolvePublishing(t.engine)
    expect(t.rows.get(id)?.status).toBe("publishing")

    t.clock.now = new Date(t.clock.now.getTime() + UNCONFIRMED_AFTER_MS + 1000)
    await resolvePublishing(t.engine)
    expect(t.rows.get(id)?.status).toBe("failed")

    t.behaviour.create = undefined
    expect((await publish(t.engine)).result).toBe("published")
  })

  it("a retry adopts an advert OLX already has instead of creating another", async () => {
    const t = setup()
    t.behaviour.create = () => {
      throw new OlxRefusedError(400, "no")
    }
    await publish(t.engine)
    const row = [...t.rows.values()][0]
    t.adverts.set("777", { id: 777, status: "active", external_id: row.id })
    t.behaviour.create = undefined
    expect((await publish(t.engine)).result).toBe("published")
    expect(t.rows.get(row.id)?.olx_advert_id).toBe("777")
    expect(t.calls.create).toBe(1)
  })

  it("takes the advert down right away when the item sold during publishing", async () => {
    const t = setup()
    t.behaviour.create = () => {
      t.stock.var_1 = false
    }
    const result = await publish(t.engine)
    expect(result.result).toBe("published")
    expect(t.calls.commands).toEqual([{ command: "deactivate", is_success: false }])
    expect([...t.rows.values()][0]).toMatchObject({ status: "removed_by_user", sold_channel: "store" })
  })
})

describe("stock", () => {
  it("takes down adverts of variants that cannot be bought, and only those", async () => {
    const t = setup()
    await publish(t.engine, "var_1")
    await publish(t.engine, "var_2")
    t.stock.var_1 = false
    expect(await checkStock(t.engine, "all")).toBe(1)
    expect(t.calls.commands).toEqual([{ command: "deactivate", is_success: false }])
    const [first, second] = [...t.rows.values()]
    expect(first).toMatchObject({ status: "removed_by_user", sold_channel: "store", pending_deactivate: false })
    expect(second.status).toBe("new")
  })

  it("never takes an advert down on a guess", async () => {
    const t = setup()
    await publish(t.engine)
    t.stock.var_1 = null
    expect(await checkStock(t.engine, ["var_1"])).toBe(0)
    expect(t.calls.commands).toEqual([])
  })

  it("keeps trying until OLX confirms the take-down", async () => {
    const t = setup()
    await publish(t.engine)
    t.stock.var_1 = false
    t.behaviour.command = () => {
      throw new HttpTimeoutError("/adverts/500/commands", 1000)
    }
    await checkStock(t.engine, "all")
    const row = [...t.rows.values()][0]
    expect(row).toMatchObject({ pending_deactivate: true, status: "new", claimed_at: null })

    t.behaviour.command = undefined
    const summary = await runSync(t.engine)
    expect(summary.retried).toBe(1)
    expect(t.rows.get(row.id)).toMatchObject({ pending_deactivate: false, status: "removed_by_user" })
  })

  it("treats 'already inactive' from OLX as done", async () => {
    const t = setup()
    await publish(t.engine)
    t.adverts.get("500")!.status = "removed_by_user"
    t.stock.var_1 = false
    t.behaviour.command = () => {
      throw new OlxRefusedError(400, "Advert is not active")
    }
    await checkStock(t.engine, "all")
    expect([...t.rows.values()][0]).toMatchObject({ pending_deactivate: false, status: "removed_by_user" })
  })

  it("a refusal for an advert that is still live stays pending", async () => {
    const t = setup()
    await publish(t.engine)
    t.stock.var_1 = false
    t.behaviour.command = () => {
      throw new OlxRefusedError(403, "Forbidden")
    }
    await checkStock(t.engine, "all")
    expect([...t.rows.values()][0]).toMatchObject({ pending_deactivate: true, last_error: "Forbidden" })
  })
})

describe("edit, take down, bring back", () => {
  it("saves an edit on OLX, then here", async () => {
    const t = setup()
    await publish(t.engine)
    const id = [...t.rows.keys()][0]
    const result = await updateAdvert(t.engine, id, { ...input, price: "349.00" })
    expect(result.result).toBe("saved")
    expect(t.rows.get(id)?.price).toBe("349.00")
  })

  it("keeps the old data when OLX refuses an edit", async () => {
    const t = setup()
    await publish(t.engine)
    const id = [...t.rows.keys()][0]
    t.behaviour.update = () => {
      throw new OlxRefusedError(400, "Nope")
    }
    expect((await updateAdvert(t.engine, id, { ...input, price: "349.00" })).result).toBe("refused")
    expect(t.rows.get(id)).toMatchObject({ price: "399.00", last_error: "Nope", claimed_at: null })
  })

  it("does not bring an advert back while the item cannot be bought", async () => {
    const t = setup()
    await publish(t.engine)
    const id = [...t.rows.keys()][0]
    await deactivateAdvert(t.engine, id)
    t.stock.var_1 = false
    expect(await activateAdvert(t.engine, id)).toEqual({ result: "conflict", code: "out_of_stock" })
    expect(t.calls.commands).toHaveLength(1)
  })

  it("bringing an advert back clears the sold mark", async () => {
    const t = setup()
    await publish(t.engine)
    const id = [...t.rows.keys()][0]
    t.stock.var_1 = false
    await checkStock(t.engine, "all")
    t.stock.var_1 = true
    expect((await activateAdvert(t.engine, id)).result).toBe("saved")
    expect(t.rows.get(id)).toMatchObject({ status: "active", sold_channel: null, sold_at: null })
  })

  it("stock coming back republishes nothing by itself", async () => {
    const t = setup()
    await publish(t.engine)
    t.stock.var_1 = false
    await checkStock(t.engine, "all")
    t.stock.var_1 = true
    await runSync(t.engine)
    expect(t.calls.commands.filter((c) => c.command === "activate")).toHaveLength(0)
  })
})

describe("change feed", () => {
  it("starts at the first run without replaying history", async () => {
    const t = setup()
    expect(await syncFeed(t.engine)).toBe(0)
    expect(t.cursor()).toMatchObject({ cursor: null, since: "2026-11-21T12:00:00.000Z" })
  })

  it("updates adverts changed on OLX and saves the position", async () => {
    const t = setup()
    await publish(t.engine)
    await syncFeed(t.engine)
    t.adverts.get("500")!.status = "blocked"
    t.behaviour.pages = [
      { ids: ["999"], hasMore: true, nextCursor: "c1" },
      { ids: ["500"], hasMore: false, nextCursor: "c2" },
    ]
    expect(await syncFeed(t.engine)).toBe(1)
    expect([...t.rows.values()][0].status).toBe("blocked")
    expect(t.cursor()?.cursor).toBe("c2")
  })

  it("an advert deleted on OLX is marked as gone", async () => {
    const t = setup()
    await publish(t.engine)
    await syncFeed(t.engine)
    t.adverts.delete("500")
    t.behaviour.pages = [{ ids: ["500"], hasMore: false, nextCursor: "c1" }]
    await syncFeed(t.engine)
    expect([...t.rows.values()][0].status).toBe("removed_by_user")
  })

  it("reopens from the last complete sync when OLX rejects the cursor", async () => {
    const t = setup()
    await t.store.saveCursor({
      since: "2026-11-01T00:00:00.000Z",
      cursor: "old",
      last_success_at: "2026-11-20T00:00:00.000Z",
    })
    t.behaviour.feedError = new OlxRefusedError(400, "Bad cursor")
    await syncFeed(t.engine)
    expect(t.cursor()?.since).toBe("2026-11-20T00:00:00.000Z")
  })

  it("one failing part of the sync does not stop the others", async () => {
    const t = setup()
    await publish(t.engine)
    await syncFeed(t.engine)
    t.stock.var_1 = false
    t.behaviour.feedError = new Error("feed down")
    const summary = await runSync(t.engine)
    expect(summary.taken_down).toBe(1)
    expect(summary.errors).toEqual(["feed: feed down"])
  })
})
