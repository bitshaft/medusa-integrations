import { evaluateRuleValueCondition } from "./rule-eval"
import {
  appliedGroups,
  buildPromotionContext,
  codesAfterAction,
  enteredTierCodes,
  type KnownPromotion,
  type TierGroup,
} from "../context"
import { codesOfOrder, statsByCode, sumStats } from "../orders"
import { buildCampaign, buildPromotions, CONTEXT, exclusionRule, itemKeys, tierCode } from "../promotions"
import { countByFilter, couponStatus, isExpiring, type StatusInput } from "../status"
import { csvFileName, toCsv } from "../csv"
import { draft } from "./fixtures"

describe("buildPromotions", () => {
  it("maps a percentage coupon onto one order-level promotion", () => {
    const [p] = buildPromotions(draft({ usage_limit: 500, min_subtotal: 300 }), "JESIEN15")
    expect(p).toMatchObject({
      code: "JESIEN15",
      type: "standard",
      is_automatic: false,
      limit: 500,
      application_method: {
        type: "percentage",
        target_type: "items",
        allocation: "across",
        value: 15,
        target_rules: [],
      },
      metadata: { coupons_group: "JESIEN15", coupons_tier: null, coupons_exclusive: false, coupons_entered: true },
    })
    expect(p.rules).toEqual([{ attribute: "original_item_total", operator: "gte", values: ["300"] }])
  })

  it("maps fixed, free shipping, category and buy X get Y", () => {
    expect(buildPromotions(draft({ kind: "fixed", value: 50 }), "X")[0].application_method).toMatchObject({
      type: "fixed",
      value: 50,
      currency_code: "pln",
      target_type: "items",
      allocation: "across",
    })
    expect(buildPromotions(draft({ kind: "free_shipping", value: null }), "X")[0].application_method).toEqual({
      type: "percentage",
      target_type: "shipping_methods",
      allocation: "across",
      value: 100,
    })
    expect(
      buildPromotions(draft({ kind: "category", category_ids: ["c1", "c2"] }), "X")[0].application_method
    ).toMatchObject({
      target_type: "items",
      target_rules: [{ attribute: CONTEXT.itemKeys, operator: "in", values: ["k:c1", "k:c2"] }],
    })
    const [bxgy] = buildPromotions(
      draft({ kind: "buy_get", value: 100, buy_qty: 3, get_qty: 1, buy_product_ids: ["p1"] }),
      "X"
    )
    expect(bxgy.type).toBe("buyget")
    expect(bxgy.application_method).toMatchObject({
      value: 100,
      buy_rules_min_quantity: 3,
      apply_to_quantity: 1,
      buy_rules: [{ attribute: CONTEXT.itemKeys, operator: "in", values: ["p:p1"] }],
    })
  })

  it("turns exclusions into one ne rule on the item keys", () => {
    const d = draft({
      exclusions: { product_ids: ["p1"], collection_ids: ["col"], category_ids: ["cat"], skip_discounted: true },
    })
    expect(exclusionRule(d)).toEqual({
      attribute: CONTEXT.itemKeys,
      operator: "ne",
      values: ["p:p1", "c:col", "k:cat", "sale"],
    })
    expect(buildPromotions(d, "X")[0].application_method.target_rules).toEqual([exclusionRule(d)])
    expect(exclusionRule(draft())).toBeNull()
  })

  it("adds audience and first-order rules", () => {
    expect(
      buildPromotions(draft({ audience: "groups", audience_ids: ["g1"], first_order_only: true }), "X")[0].rules
    ).toEqual([
      { attribute: CONTEXT.groupIds, operator: "in", values: ["g1"] },
      { attribute: CONTEXT.firstOrder, operator: "eq", values: ["true"] },
    ])
    expect(buildPromotions(draft({ audience: "customers", audience_ids: ["cus_1"] }), "X")[0].rules).toEqual([
      { attribute: CONTEXT.customerId, operator: "in", values: ["cus_1"] },
    ])
  })

  it("lets automatic coupons step aside instead of combining", () => {
    const plain = buildPromotions(draft({ automatic: true, code: null }), "AUTO")[0]
    expect(plain.is_automatic).toBe(true)
    expect(plain.rules).toContainEqual({ attribute: CONTEXT.exclusiveCode, operator: "ne", values: ["true"] })
    const exclusive = buildPromotions(draft({ automatic: true, code: null, exclusive: true }), "AUTO")[0]
    expect(exclusive.rules).toContainEqual({ attribute: CONTEXT.hasCodes, operator: "ne", values: ["true"] })
    // A coupon with a code needs neither: adding a conflicting code is refused up front.
    expect(buildPromotions(draft({ exclusive: true }), "X")[0].rules).toEqual([])
  })

  it("splits a tiered coupon into one automatic promotion per band, opened by the entered code", () => {
    const d = draft({
      value: null,
      tiers: [
        { min: 500, value: 10 },
        { min: 200, value: 5 },
      ],
      usage_limit: 100,
    })
    const levels = buildPromotions(d, "PROGI")
    expect(levels.map((p) => p.code)).toEqual(["PROGI__T1", "PROGI__T2"])
    expect(levels.every((p) => p.is_automatic && p.limit === null)).toBe(true)
    expect(levels[0].application_method.value).toBe(5)
    expect(levels[0].rules).toEqual([
      { attribute: "original_item_total", operator: "gte", values: ["200"] },
      { attribute: "original_item_total", operator: "lt", values: ["500"] },
      { attribute: CONTEXT.codes, operator: "in", values: ["PROGI"] },
    ])
    expect(levels[1].rules).toEqual([
      { attribute: "original_item_total", operator: "gte", values: ["500"] },
      { attribute: CONTEXT.codes, operator: "in", values: ["PROGI"] },
    ])
    expect(levels[1].metadata).toEqual({
      coupons_group: "PROGI",
      coupons_tier: 1,
      coupons_exclusive: false,
      coupons_entered: true,
    })
    // The usage limit is shared on the campaign, so it counts the coupon, not each level.
    expect(buildCampaign(d, "PROGI").budget).toEqual({ type: "usage", limit: 100 })
    // Always a budget for tiers, so a limit can be added later; null means unlimited.
    expect(buildCampaign({ ...d, usage_limit: null }, "PROGI").budget).toEqual({ type: "usage", limit: null })
  })

  it("does not gate automatic tiers on a code, and keeps a higher minimum basket", () => {
    const levels = buildPromotions(
      draft({
        automatic: true,
        code: null,
        value: null,
        min_subtotal: 250,
        tiers: [
          { min: 200, value: 5 },
          { min: 500, value: 10 },
        ],
      }),
      "AUTO"
    )
    expect(levels[0].rules).toContainEqual({ attribute: "original_item_total", operator: "gte", values: ["250"] })
    expect(levels.flatMap((p) => p.rules).some((r) => r.attribute === CONTEXT.codes)).toBe(false)
  })

  it("puts the dates on the campaign and the plain usage limit on the promotion", () => {
    const campaign = buildCampaign(
      draft({ starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-30T00:00:00Z", usage_limit: 5 }),
      "KOD"
    )
    expect(campaign).toEqual({
      name: "Coupon KOD",
      campaign_identifier: "coupons-kod",
      starts_at: new Date("2026-10-01T00:00:00Z"),
      ends_at: new Date("2026-11-30T00:00:00Z"),
    })
  })

  it("names tier codes predictably", () => {
    expect(tierCode("ABC", 0)).toBe("ABC__T1")
  })
})

describe("itemKeys", () => {
  it("always includes the catch-all key, and marks items below their compare-at price", () => {
    expect(itemKeys({})).toEqual(["*"])
    expect(
      itemKeys({
        product: { id: "p1", collection_id: "col", categories: [{ id: "k1" }, { id: "k2" }] },
        unit_price: 80,
        compare_at_unit_price: 100,
      })
    ).toEqual(["*", "p:p1", "c:col", "k:k1", "k:k2", "sale"])
    expect(itemKeys({ product_id: "p2", unit_price: 100, compare_at_unit_price: 100 })).toEqual(["*", "p:p2"])
    expect(itemKeys({ product_id: "p2", unit_price: 100, compare_at_unit_price: null })).toEqual(["*", "p:p2"])
  })

  it("makes the core rule evaluation exclude and include the right items", () => {
    const rule = exclusionRule(
      draft({ exclusions: { product_ids: ["p1"], collection_ids: [], category_ids: ["k9"], skip_discounted: true } })
    )!
    const check = (item: Parameters<typeof itemKeys>[0]) =>
      evaluateRuleValueCondition(rule.values, rule.operator, itemKeys(item))
    expect(check({ product_id: "p2" })).toBe(true)
    expect(check({ product_id: "p1" })).toBe(false)
    expect(check({ product: { id: "p3", categories: [{ id: "k9" }] } })).toBe(false)
    expect(check({ product_id: "p3", unit_price: 50, compare_at_unit_price: 70 })).toBe(false)
  })
})

describe("promotion context", () => {
  const known = new Map<string, KnownPromotion>([
    [
      "EXCL",
      {
        code: "EXCL",
        is_automatic: false,
        coupon: { coupons_group: "EXCL", coupons_tier: null, coupons_exclusive: true, coupons_entered: true },
      },
    ],
    [
      "PLAIN",
      {
        code: "PLAIN",
        is_automatic: false,
        coupon: { coupons_group: "PLAIN", coupons_tier: null, coupons_exclusive: false, coupons_entered: true },
      },
    ],
    [
      "AUTO",
      {
        code: "AUTO",
        is_automatic: true,
        coupon: { coupons_group: "AUTO", coupons_tier: null, coupons_exclusive: false, coupons_entered: false },
      },
    ],
    [
      "PROGI__T2",
      {
        code: "PROGI__T2",
        is_automatic: true,
        coupon: { coupons_group: "PROGI", coupons_tier: 1, coupons_exclusive: false, coupons_entered: true },
      },
    ],
    ["CORE10", { code: "CORE10", is_automatic: false, coupon: null }],
    ["COREAUTO", { code: "COREAUTO", is_automatic: true, coupon: null }],
  ])
  const tiers = new Map<string, TierGroup>([
    ["PROGI", { group: "PROGI", exclusive: false }],
    ["VIP", { group: "VIP", exclusive: true }],
  ])
  const customer = { id: null, group_ids: [], first_order: true }

  it("remembers entered tier codes across add, refresh and remove", () => {
    const cart = { metadata: { coupons_codes: ["PROGI"] }, promotions: [{ code: "PROGI__T2" }] }
    expect(enteredTierCodes({}, "add", ["progi"], known, tiers)).toEqual(["PROGI"])
    expect(enteredTierCodes(cart, "replace", ["PROGI__T2"], known, tiers)).toEqual(["PROGI"])
    expect(enteredTierCodes(cart, "remove", ["PROGI"], known, tiers)).toEqual([])
    expect(enteredTierCodes(cart, "remove", ["PROGI__T2"], known, tiers)).toEqual([])
    // Codes that are no longer tiered coupons are dropped.
    expect(enteredTierCodes({ metadata: { coupons_codes: ["GONE"] } }, "replace", [], known, tiers)).toEqual([])
  })

  it("computes the codes core will apply", () => {
    const cart = { promotions: [{ code: "PLAIN" }, { code: "AUTO" }] }
    expect(codesAfterAction(cart, "add", ["EXCL"])).toEqual(["PLAIN", "AUTO", "EXCL"])
    expect(codesAfterAction(cart, "remove", ["PLAIN"])).toEqual(["AUTO"])
    expect(codesAfterAction(cart, "replace", ["PLAIN"])).toEqual(["PLAIN"])
  })

  it("ignores the plugin's own automatic coupons in exclusivity checks, but not foreign ones", () => {
    const groups = appliedGroups(["AUTO", "COREAUTO", "PROGI__T2", "CORE10"], [], known, tiers)
    expect(groups).toEqual([
      { group: "COREAUTO", exclusive: false, entered: false },
      { group: "PROGI", exclusive: false, entered: true },
      { group: "CORE10", exclusive: false, entered: true },
    ])
  })

  it("sets every attribute, with the flags automatic coupons look at", () => {
    const ctx = buildPromotionContext({
      cart: { items: [{ id: "i1", product_id: "p1" }], promotions: [{ code: "AUTO" }] },
      action: "add",
      promo_codes: ["EXCL"],
      known,
      tierGroups: tiers,
      customer,
    })
    expect(ctx).toEqual({
      items: [{ id: "i1", product_id: "p1", coupons_keys: ["*", "p:p1"] }],
      coupons_codes: [],
      coupons_customer: { id: "guest", group_ids: [], first_order: "true" },
      coupons_has_codes: "true",
      coupons_exclusive_code: "true",
    })
  })

  it("reports no codes when only automatic promotions are on the cart", () => {
    const ctx = buildPromotionContext({
      cart: { promotions: [{ code: "AUTO" }] },
      action: "replace",
      promo_codes: ["AUTO"],
      known,
      tierGroups: tiers,
      customer,
    })
    expect(ctx.coupons_has_codes).toBe("false")
    expect(ctx.coupons_exclusive_code).toBe("false")
  })

  it("treats an entered exclusive tiered coupon as an exclusive code", () => {
    const ctx = buildPromotionContext({
      cart: {},
      action: "add",
      promo_codes: ["VIP"],
      known,
      tierGroups: tiers,
      customer,
    })
    expect(ctx.coupons_codes).toEqual(["VIP"])
    expect(ctx.coupons_exclusive_code).toBe("true")
  })

  it("lets the core rules decide which automatic coupons apply", () => {
    // The same evaluation core runs: an automatic non-exclusive coupon steps aside for an exclusive code only.
    const stepAside = (ctx: Record<string, unknown>) =>
      evaluateRuleValueCondition(["true"], "ne", ctx.coupons_exclusive_code)
    const base = { known, tierGroups: tiers, customer }
    expect(stepAside(buildPromotionContext({ ...base, cart: {}, action: "add", promo_codes: ["PLAIN"] }))).toBe(true)
    expect(stepAside(buildPromotionContext({ ...base, cart: {}, action: "add", promo_codes: ["EXCL"] }))).toBe(false)
  })
})

describe("status", () => {
  const now = new Date("2026-11-14T12:00:00Z")
  const base: StatusInput = {
    promotion_status: "active",
    starts_at: null,
    ends_at: null,
    limit: null,
    used: 0,
    automatic: false,
  }

  it("classifies coupons", () => {
    expect(couponStatus(base, now)).toBe("active")
    expect(couponStatus({ ...base, promotion_status: "inactive" }, now)).toBe("paused")
    expect(couponStatus({ ...base, promotion_status: "draft" }, now)).toBe("paused")
    expect(couponStatus({ ...base, starts_at: "2026-12-01T00:00:00Z" }, now)).toBe("scheduled")
    expect(couponStatus({ ...base, ends_at: "2026-11-14T12:00:00Z" }, now)).toBe("ended")
    expect(couponStatus({ ...base, limit: 5, used: 5 }, now)).toBe("ended")
    expect(couponStatus({ ...base, promotion_status: "inactive", ends_at: "2026-01-01T00:00:00Z" }, now)).toBe("ended")
  })

  it("flags coupons ending within seven days", () => {
    expect(isExpiring({ ...base, ends_at: "2026-11-21T12:00:00Z" }, now)).toBe(true)
    expect(isExpiring({ ...base, ends_at: "2026-11-21T12:00:01Z" }, now)).toBe(false)
    expect(isExpiring({ ...base, promotion_status: "inactive", ends_at: "2026-11-15T00:00:00Z" }, now)).toBe(false)
  })

  it("counts every filter", () => {
    const counts = countByFilter(
      [
        base,
        { ...base, automatic: true },
        { ...base, ends_at: "2026-11-16T00:00:00Z" },
        { ...base, promotion_status: "inactive" },
        { ...base, starts_at: "2027-01-01T00:00:00Z" },
        { ...base, limit: 1, used: 1 },
      ],
      now
    )
    expect(counts).toEqual({ all: 6, active: 3, scheduled: 1, paused: 1, ended: 1, expiring: 1, automatic: 1 })
  })
})

describe("order stats", () => {
  const orders = [
    {
      id: "o1",
      display_id: 1,
      created_at: "2026-11-01",
      email: "a@b.pl",
      customer_id: null,
      currency_code: "pln",
      total: 255,
      adjustments: [
        { code: "JESIEN15", amount: 30 },
        { code: "JESIEN15", amount: 15 },
        { code: "DOSTAWA", amount: 12.99 },
      ],
    },
    {
      id: "o2",
      display_id: 2,
      created_at: "2026-11-02",
      email: "c@d.pl",
      customer_id: "cus_1",
      currency_code: "pln",
      total: 100.1,
      adjustments: [
        { code: "JESIEN15", amount: 10.2 },
        { code: null, amount: 3 },
      ],
    },
  ]

  it("counts each order once per code and sums discount and revenue", () => {
    const stats = statsByCode(orders)
    expect(stats.get("JESIEN15")).toEqual({ orders: 2, discount: 55.2, revenue: 355.1 })
    expect(stats.get("DOSTAWA")).toEqual({ orders: 1, discount: 12.99, revenue: 255 })
    expect(sumStats([stats.get("JESIEN15"), undefined, stats.get("DOSTAWA")])).toEqual({
      orders: 3,
      discount: 68.19,
      revenue: 610.1,
    })
    expect(codesOfOrder(orders[0])).toEqual(["JESIEN15", "DOSTAWA"])
  })
})

describe("csv", () => {
  it("writes Excel-friendly CSV and neutralises formulas", () => {
    const csv = toCsv(
      ["Kod", "Rabat", "Opis"],
      [
        ["JESIEN15", 12.5, 'Zdanie; z "cudzysłowem"'],
        ["=HYPERLINK()", -5, null],
      ]
    )
    expect(csv).toBe('﻿Kod;Rabat;Opis\r\nJESIEN15;12,5;"Zdanie; z ""cudzysłowem"""\r\n\'=HYPERLINK();-5;\r\n')
    expect(csvFileName("kupony seria/1", new Date("2026-11-14T10:00:00Z"))).toBe("kupony-seria-1-2026-11-14.csv")
  })
})
