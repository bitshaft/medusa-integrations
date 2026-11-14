import { codesOnCart, effectiveMinimum, enteredOnCart, lifecycleReason } from "../server/checks"
import type { CouponWithPromotions, PromotionRecord } from "../server/query"
import { draft } from "./fixtures"

const promotion = (overrides: Partial<PromotionRecord> = {}): PromotionRecord => ({
  id: "promo_1",
  code: "KOD",
  status: "active",
  is_automatic: false,
  limit: null,
  used: 0,
  campaign_id: "camp_1",
  starts_at: null,
  ends_at: null,
  budget_limit: null,
  budget_used: 0,
  ...overrides,
})

const coupon = (overrides: Partial<CouponWithPromotions> = {}): CouponWithPromotions => ({
  id: "coup_1",
  code: "KOD",
  name: null,
  kind: "percentage",
  automatic: false,
  exclusive: false,
  tiered: false,
  batch_size: null,
  batch_prefix: null,
  draft: draft({ code: "KOD" }),
  campaign_id: "camp_1",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  promotions: [promotion()],
  ...overrides,
})

describe("lifecycleReason", () => {
  const now = new Date("2026-11-14T12:00:00Z")

  it("accepts a running coupon", () => {
    expect(lifecycleReason(coupon(), "KOD", now)).toBeNull()
  })

  it("names what core would reject silently", () => {
    expect(lifecycleReason(coupon({ promotions: [promotion({ status: "inactive" })] }), "KOD", now)).toBe("paused")
    expect(
      lifecycleReason(coupon({ promotions: [promotion({ starts_at: "2026-12-01T00:00:00Z" })] }), "KOD", now)
    ).toBe("not_started")
    expect(lifecycleReason(coupon({ promotions: [promotion({ ends_at: "2026-11-01T00:00:00Z" })] }), "KOD", now)).toBe(
      "ended"
    )
    expect(lifecycleReason(coupon({ promotions: [promotion({ limit: 5, used: 5 })] }), "KOD", now)).toBe("exhausted")
    // A paused coupon past its end date is reported as ended: resuming would not help.
    expect(
      lifecycleReason(
        coupon({ promotions: [promotion({ status: "inactive", ends_at: "2026-11-01T00:00:00Z" })] }),
        "KOD",
        now
      )
    ).toBe("ended")
  })

  it("uses the shared budget for tiered coupons", () => {
    const tiered = coupon({
      tiered: true,
      promotions: [promotion({ code: "KOD__T1", budget_limit: 10, budget_used: 10 }), promotion({ code: "KOD__T2" })],
    })
    expect(lifecycleReason(tiered, "KOD", now)).toBe("exhausted")
  })

  it("checks the typed code of a batch, not the whole batch", () => {
    const batch = coupon({
      code: "BATCH-1",
      batch_size: 2,
      promotions: [
        promotion({ code: "NL-AAAA", limit: 1, used: 1 }),
        promotion({ id: "promo_2", code: "NL-BBBB", limit: 1 }),
      ],
    })
    expect(lifecycleReason(batch, "NL-AAAA", now)).toBe("exhausted")
    expect(lifecycleReason(batch, "NL-BBBB", now)).toBeNull()
    expect(lifecycleReason(batch, "NL-CCCC", now)).toBe("not_found")
  })
})

describe("effectiveMinimum", () => {
  it("is the larger of the minimum basket and the first tier", () => {
    expect(effectiveMinimum(draft())).toBeNull()
    expect(effectiveMinimum(draft({ min_subtotal: 300 }))).toBe(300)
    expect(
      effectiveMinimum(
        draft({
          tiers: [
            { min: 500, value: 10 },
            { min: 200, value: 5 },
          ],
        })
      )
    ).toBe(200)
    expect(
      effectiveMinimum(
        draft({
          min_subtotal: 250,
          tiers: [
            { min: 200, value: 5 },
            { min: 500, value: 10 },
          ],
        })
      )
    ).toBe(250)
  })
})

describe("cart codes", () => {
  it("reads codes from promotions and from adjustments", () => {
    expect(
      codesOnCart({
        id: "cart_1",
        promotions: [{ code: "A" }, null],
        items: [{ adjustments: [{ code: "B" }, { code: null }] }, null],
        shipping_methods: [{ adjustments: [{ code: "A" }, { code: "C" }] }],
      })
    ).toEqual(["A", "B", "C"])
  })

  it("reads entered tiered codes from the cart metadata", () => {
    expect(enteredOnCart({ id: "cart_1", metadata: { coupons_codes: ["progi", 3, "VIP"] } })).toEqual(["PROGI", "VIP"])
    expect(enteredOnCart({ id: "cart_1", metadata: null })).toEqual([])
  })
})
