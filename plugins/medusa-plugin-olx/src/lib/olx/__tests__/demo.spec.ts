import { DemoOlxApi, type DemoStore, demoOlxId, isPreviewVariant, previewProductId, previewVariantId } from "../demo"
import { DEMO_SAMPLES, sampleState } from "../demo-seed"
import type { AdvertInput, AdvertRecord } from "../types"
import { validateAdvert } from "../validation"

const payload: AdvertInput = {
  title: "Wool flannel jacket, size 50",
  description: "Sample advert from the plugin's demo mode, long enough to pass the rules of the advert form.",
  price: "399.00",
  negotiable: false,
  category_id: 9001,
  attributes: [],
  images: ["https://cdn.example.com/a.jpg"],
  city_id: 8001,
  district_id: null,
  contact_name: "Demo store",
  contact_phone: null,
  advertiser_type: "business",
}

const record = (patch: Partial<AdvertRecord>): AdvertRecord => ({
  id: "olxad_1",
  variant_id: "var_1",
  product_id: "prod_1",
  demo: true,
  olx_advert_id: null,
  status: "publishing",
  url: null,
  valid_to: null,
  title: payload.title,
  price: payload.price,
  payload,
  last_error: null,
  pending_deactivate: false,
  pending_success: false,
  sold_channel: null,
  sold_at: null,
  claimed_at: null,
  write_started_at: null,
  synced_at: null,
  ...patch,
})

function store(rows: AdvertRecord[]): DemoStore & { rows: Map<string, AdvertRecord> } {
  const map = new Map(rows.map((row) => [row.id, row]))
  return {
    rows: map,
    getRecord: async (id) => map.get(id) ?? null,
    findByOlxId: async (id) => [...map.values()].find((row) => row.olx_advert_id === id) ?? null,
    patchRecord: async (id, patch) => {
      const row = { ...map.get(id)!, ...patch }
      map.set(id, row)
      return row
    },
  }
}

describe("the simulated OLX", () => {
  it("keeps its state in the rows, so a new instance (a restart) sees the same adverts", async () => {
    const s = store([record({ olx_advert_id: "demo-olxad_1", status: "active" })])
    await new DemoOlxApi(s).command("demo-olxad_1", { command: "deactivate", is_success: false })
    expect((await new DemoOlxApi(s).getAdvert("demo-olxad_1"))?.status).toBe("removed_by_user")
  })

  it("gives ids that cannot repeat after a restart", async () => {
    const s = store([])
    const first = await new DemoOlxApi(s).createAdvert(payload, "olxad_1")
    const second = await new DemoOlxApi(s).createAdvert(payload, "olxad_2")
    expect(first.id).toBe(demoOlxId("olxad_1"))
    expect(second.id).not.toBe(first.id)
  })

  it("passes moderation on the next read", async () => {
    const s = store([record({ olx_advert_id: "demo-olxad_1", status: "new" })])
    expect((await new DemoOlxApi(s).getAdvert("demo-olxad_1"))?.status).toBe("active")
  })

  it("bringing an advert back makes it active with a new end date", async () => {
    const s = store([record({ olx_advert_id: "demo-olxad_1", status: "outdated", last_error: "old" })])
    await new DemoOlxApi(s).command("demo-olxad_1", { command: "activate" })
    const row = s.rows.get("olxad_1")!
    expect(row).toMatchObject({ status: "active", last_error: null })
    expect(row.valid_to!.getTime()).toBeGreaterThan(Date.now())
  })

  it("links to no page on OLX, because none exists", async () => {
    const s = store([record({ olx_advert_id: "demo-olxad_1", status: "active" })])
    expect((await new DemoOlxApi(s).getAdvert("demo-olxad_1"))?.url).toBeNull()
  })

  it("does not know an advert that was never created", async () => {
    const s = store([record({})])
    expect(await new DemoOlxApi(s).findByExternalId("olxad_1")).toBeNull()
    expect(await new DemoOlxApi(s).getAdvert("demo-nope")).toBeNull()
  })
})

describe("sample adverts", () => {
  const now = new Date("2026-11-23T12:00:00Z")

  it("cover every state the admin can meet, once each", () => {
    expect(new Set(DEMO_SAMPLES.map((sample) => sample.key)).size).toBe(DEMO_SAMPLES.length)
    expect(new Set(DEMO_SAMPLES.map((sample) => sample.status))).toEqual(
      new Set(["active", "new", "limited", "outdated", "moderated", "failed", "removed_by_user"])
    )
    expect(DEMO_SAMPLES.flatMap((sample) => sample.sold ?? []).sort()).toEqual(["olx", "store"])
  })

  it("have titles OLX would accept", () => {
    for (const sample of DEMO_SAMPLES) {
      const issues = validateAdvert({ ...payload, title: sample.title, price: sample.price })
      expect(issues).toEqual([])
    }
  })

  it("a failed sample is not on OLX, the others are", () => {
    for (const sample of DEMO_SAMPLES) {
      const state = sampleState(sample, "olxad_1", now)
      expect(state.olx_advert_id).toBe(sample.status === "failed" ? null : "demo-olxad_1")
    }
  })

  it("an expired sample ended in the past, a live one ends in the future", () => {
    const of = (key: string) =>
      sampleState(
        DEMO_SAMPLES.find((sample) => sample.key === key)!,
        "x",
        now
      )
    expect(of("expired").valid_to!.getTime()).toBeLessThan(now.getTime())
    expect(of("active").valid_to!.getTime()).toBeGreaterThan(now.getTime())
  })

  it("preview rows are told apart from real variants", () => {
    expect(isPreviewVariant(previewVariantId("active"))).toBe(true)
    expect(isPreviewVariant("variant_01ABC")).toBe(false)
    expect(previewProductId("active")).toBe("demo_product_active")
  })
})
