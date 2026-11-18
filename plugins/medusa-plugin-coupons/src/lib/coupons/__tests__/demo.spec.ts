import { normalizeDraft } from "../server/admin"
import { DEMO_NAME_PREFIX, demoCoupons } from "../server/demo"
import { couponStatus, isExpiring } from "../status"
import { COUPON_KINDS } from "../types"
import { validateDraft } from "../validation"

const NOW = new Date("2026-11-19T10:00:00.000Z")
const full = { categoryId: "pcat_1", productIds: ["prod_1", "prod_2", "prod_3"], groupId: "cusgroup_1" }

describe("demo coupons", () => {
  const coupons = demoCoupons(NOW, full)

  it("passes the wizard's own validation", () => {
    for (const coupon of coupons) {
      const draft = normalizeDraft(
        coupon.batch ? { ...coupon.draft, code: "BATCHCODE", usage_limit: 1 } : coupon.draft,
        "pln"
      )
      expect({ name: coupon.name, errors: validateDraft(draft).errors }).toEqual({ name: coupon.name, errors: [] })
    }
  })

  it("covers every kind, tiers, automatic, a batch and every status", () => {
    expect(new Set(coupons.map((c) => c.draft.kind))).toEqual(new Set(COUPON_KINDS))
    expect(coupons.some((c) => c.draft.tiers?.length)).toBe(true)
    expect(coupons.some((c) => c.draft.automatic)).toBe(true)
    expect(coupons.some((c) => c.batch)).toBe(true)
    expect(coupons.some((c) => c.draft.first_order_only)).toBe(true)
    expect(coupons.some((c) => c.draft.audience === "groups")).toBe(true)
    const statuses = coupons.map((c) =>
      couponStatus(
        {
          ends_at: c.draft.ends_at,
          starts_at: c.draft.starts_at,
          limit: null,
          used: 0,
          promotion_status: c.paused ? "inactive" : "active",
        } as never,
        NOW
      )
    )
    expect(new Set(statuses)).toEqual(new Set(["active", "scheduled", "paused", "ended"]))
    expect(
      coupons.some((c) =>
        isExpiring(
          {
            ends_at: c.draft.ends_at,
            starts_at: c.draft.starts_at,
            limit: null,
            used: 0,
            promotion_status: "active",
          } as never,
          NOW
        )
      )
    ).toBe(true)
  })

  it("marks every coupon as demo and uses DEMO- codes", () => {
    expect(coupons.every((c) => c.name.startsWith(DEMO_NAME_PREFIX))).toBe(true)
    for (const c of coupons) {
      if (c.draft.code) expect(c.draft.code).toMatch(/^DEMO-/)
      if (c.batch) expect(c.batch.prefix).toMatch(/^DEMO-/)
    }
  })

  it("leaves out coupons the store has no data for", () => {
    const bare = demoCoupons(NOW, { categoryId: null, productIds: [], groupId: null })
    expect(bare.some((c) => c.draft.kind === "category" || c.draft.kind === "buy_get")).toBe(false)
    expect(bare.some((c) => c.draft.audience === "groups")).toBe(false)
    expect(bare.length).toBeGreaterThanOrEqual(8)
  })
})
