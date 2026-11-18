import path from "node:path"

import type { IPromotionModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { buildPromotionContext, type KnownPromotion, type TierGroup } from "../../src/lib/coupons/context"
import { buildCampaign, buildPromotions } from "../../src/lib/coupons/promotions"
import { normalizeDraft } from "../../src/lib/coupons/server/admin"
import { demoCoupons } from "../../src/lib/coupons/server/demo"
import { type CouponDraft, EMPTY_EXCLUSIONS } from "../../src/lib/coupons/types"

jest.setTimeout(120_000)

/**
 * The plugin's coupons as real Promotion Module records, evaluated by the
 * real `computeActions` with the context the plugin's hook builds. This is
 * what proves that core computes every discount and enforces every rule.
 */
const draft = (overrides: Partial<CouponDraft> = {}): CouponDraft => ({
  kind: "percentage",
  value: 10,
  currency_code: "pln",
  category_ids: [],
  buy_qty: null,
  get_qty: null,
  buy_product_ids: [],
  tiers: null,
  code: null,
  automatic: false,
  starts_at: null,
  ends_at: null,
  usage_limit: null,
  per_customer_limit: null,
  audience: "all",
  audience_ids: [],
  first_order_only: false,
  exclusive: false,
  min_subtotal: null,
  exclusions: { ...EMPTY_EXCLUSIONS },
  ...overrides,
})

type Item = {
  id: string
  product: { id: string; collection_id?: string | null; categories?: Array<{ id: string }> }
  price: number
  quantity?: number
  compare_at?: number
}

const cartItem = ({ id, product, price, quantity = 1, compare_at }: Item) => ({
  id,
  quantity,
  unit_price: price,
  compare_at_unit_price: compare_at ?? null,
  subtotal: price * quantity,
  original_total: price * quantity,
  total: price * quantity,
  is_discountable: true,
  product_id: product.id,
  product: { categories: [], collection_id: null, ...product },
})

moduleIntegrationTestRunner<IPromotionModuleService>({
  moduleName: Modules.PROMOTION,
  // Without `resolve` the runner looks for models in the plugin and creates no promotion tables.
  resolve: path.dirname(require.resolve("@medusajs/promotion/package.json")),
  testSuite: ({ service }) => {
    let counter = 0
    const known = new Map<string, KnownPromotion>()
    const tierGroups = new Map<string, TierGroup>()

    /** Creates a coupon the way the plugin's create workflow does. */
    async function create(d: CouponDraft, group?: string) {
      const code = group ?? `C${++counter}`
      const campaign = await service.createCampaigns(buildCampaign(d, code))
      const specs = buildPromotions(d, code)
      const created = await service.createPromotions(
        specs.map((spec) => ({ ...spec, campaign_id: campaign.id })) as never
      )
      for (const spec of specs)
        known.set(spec.code, { code: spec.code, is_automatic: spec.is_automatic, coupon: spec.metadata })
      if (d.tiers && !d.automatic) tierGroups.set(code, { group: code, exclusive: d.exclusive })
      return { code, ids: created.map((p) => p.id) }
    }

    it("creates every demo coupon as real promotions", async () => {
      const coupons = demoCoupons(new Date(), {
        categoryId: "pcat_demo",
        productIds: ["prod_a", "prod_b", "prod_c"],
        groupId: "cusgroup_demo",
      })
      for (const coupon of coupons) {
        const d = normalizeDraft(
          coupon.batch ? { ...coupon.draft, code: "DEMO-NLTEST1", usage_limit: 1 } : coupon.draft,
          "pln"
        )
        const { ids } = await create(d, d.code ?? `AUTO-DEMO${++counter}`)
        expect(ids.length).toBeGreaterThan(0)
      }
    })

    async function compute(
      codes: string[],
      items: Item[],
      extra: {
        customer?: { id: string | null; group_ids: string[]; first_order: boolean }
        metadata?: Record<string, unknown>
      } = {}
    ) {
      const cartItems = items.map(cartItem)
      const original = cartItems.reduce((sum, item) => sum + item.original_total, 0)
      const cart = { items: cartItems, metadata: extra.metadata ?? null, promotions: [] }
      const context = buildPromotionContext({
        cart,
        action: "add",
        promo_codes: codes,
        known,
        tierGroups,
        customer: extra.customer ?? { id: null, group_ids: [], first_order: true },
      })
      const actions = await service.computeActions(codes, {
        currency_code: "pln",
        email: "jan@example.com",
        original_item_total: original,
        item_total: original,
        shipping_methods: [{ id: "sm_1", subtotal: 15, original_total: 15, total: 15 }],
        ...context,
      } as never)
      // Discount per promotion code.
      const byCode: Record<string, number> = {}
      for (const action of actions as Array<{ action: string; code: string; amount?: unknown }>) {
        if (action.action.startsWith("add"))
          byCode[action.code] = round((byCode[action.code] ?? 0) + Number(action.amount))
      }
      return byCode
    }

    const round = (n: number) => Math.round(n * 100) / 100
    const shirt = (price = 100, extra: Partial<Item> = {}): Item => ({
      id: `i${++counter}`,
      product: { id: "p_shirt" },
      price,
      ...extra,
    })

    // Tests share one database: automatic coupons of one test would apply in the next.
    beforeEach(async () => {
      known.clear()
      tierGroups.clear()
      const existing = await service.listPromotions({}, { select: ["id"] })
      if (existing.length) await service.deletePromotions(existing.map((p) => p.id))
    })

    it("applies a plain percentage code to the whole order", async () => {
      const { code } = await create(draft({ value: 15, code: "X" }))
      expect(await compute([code], [shirt(200), shirt(100)])).toEqual({ [code]: 45 })
    })

    it("checks the minimum basket against the gross total before discounts", async () => {
      const { code } = await create(draft({ value: 15, min_subtotal: 300 }))
      expect(await compute([code], [shirt(299)])).toEqual({})
      expect(await compute([code], [shirt(310)])).toEqual({ [code]: 46.5 })
    })

    it("skips excluded products, collections, categories and marked-down items", async () => {
      const { code } = await create(
        draft({
          value: 10,
          exclusions: {
            product_ids: ["p_gift"],
            collection_ids: ["col_new"],
            category_ids: ["cat_sale"],
            skip_discounted: true,
          },
        })
      )
      const items: Item[] = [
        shirt(100),
        { id: "gift", product: { id: "p_gift" }, price: 100 },
        { id: "new", product: { id: "p_new", collection_id: "col_new" }, price: 100 },
        { id: "cat", product: { id: "p_cat", categories: [{ id: "cat_sale" }] }, price: 100 },
        { id: "sale", product: { id: "p_sale" }, price: 80, compare_at: 100 },
      ]
      expect(await compute([code], items)).toEqual({ [code]: 10 })
    })

    it("discounts only the chosen categories", async () => {
      const { code } = await create(draft({ kind: "category", value: 20, category_ids: ["cat_clothes"] }))
      const items: Item[] = [
        { id: "a", product: { id: "p1", categories: [{ id: "cat_clothes" }] }, price: 100 },
        shirt(100),
      ]
      expect(await compute([code], items)).toEqual({ [code]: 20 })
    })

    it("gives free shipping", async () => {
      const { code } = await create(draft({ kind: "free_shipping", value: null }))
      expect(await compute([code], [shirt(100)])).toEqual({ [code]: 15 })
    })

    it("gives Y free after buying X", async () => {
      const { code } = await create(
        draft({ kind: "buy_get", value: 100, buy_qty: 2, get_qty: 1, buy_product_ids: ["p_mug"] })
      )
      const mugs: Item = { id: "mugs", product: { id: "p_mug" }, price: 30, quantity: 3 }
      expect(await compute([code], [mugs])).toEqual({ [code]: 30 })
    })

    describe("tiers", () => {
      it("gives exactly the highest level reached, and only with the code entered", async () => {
        await create(
          draft({
            value: null,
            tiers: [
              { min: 200, value: 5 },
              { min: 500, value: 10 },
            ],
          }),
          "PROGI"
        )
        expect(await compute(["PROGI"], [shirt(150)])).toEqual({})
        expect(await compute(["PROGI"], [shirt(300)])).toEqual({ PROGI__T1: 15 })
        expect(await compute(["PROGI"], [shirt(600)])).toEqual({ PROGI__T2: 60 })
        // Without the code the levels stay closed, even though they are automatic.
        expect(await compute([], [shirt(600)])).toEqual({})
        // A refresh passes no new code: the code remembered on the cart keeps the level open.
        expect(await compute([], [shirt(600)], { metadata: { coupons_codes: ["PROGI"] } })).toEqual({ PROGI__T2: 60 })
      })

      it("applies automatic tiers without any code", async () => {
        const { code } = await create(
          draft({
            automatic: true,
            value: null,
            tiers: [
              { min: 200, value: 5 },
              { min: 500, value: 10 },
            ],
          })
        )
        expect(await compute([], [shirt(600)])).toEqual({ [`${code}__T2`]: 60 })
      })
    })

    describe("automatic coupons", () => {
      it("apply on their own, and step aside for an exclusive code", async () => {
        const auto = await create(draft({ automatic: true, value: 5 }))
        const exclusive = await create(draft({ value: 10, exclusive: true }))
        const plain = await create(draft({ value: 10 }))
        expect(await compute([], [shirt(100)])).toEqual({ [`${auto.code}`]: 5 })
        expect(Object.keys(await compute([plain.code], [shirt(100)])).sort()).toEqual([auto.code, plain.code].sort())
        expect(await compute([exclusive.code], [shirt(100)])).toEqual({ [exclusive.code]: 10 })
      })

      it("an exclusive automatic coupon steps aside when the customer enters any code", async () => {
        const auto = await create(draft({ automatic: true, exclusive: true, value: 5 }))
        const plain = await create(draft({ value: 10 }))
        expect(await compute([], [shirt(100)])).toEqual({ [auto.code]: 5 })
        expect(await compute([plain.code], [shirt(100)])).toEqual({ [plain.code]: 10 })
      })

      it("still applies when no item has a category or collection (core drops rules on missing attributes)", async () => {
        const auto = await create(
          draft({
            automatic: true,
            value: 5,
            exclusions: { ...EMPTY_EXCLUSIONS, category_ids: ["cat_x"], collection_ids: ["col_x"] },
          })
        )
        expect(await compute([], [shirt(100)])).toEqual({ [auto.code]: 5 })
      })
    })

    describe("customer rules", () => {
      it("allows first-order coupons only for first orders", async () => {
        const auto = await create(draft({ automatic: true, value: 5, first_order_only: true }))
        expect(
          await compute([], [shirt(100)], { customer: { id: "cus_1", group_ids: [], first_order: true } })
        ).toEqual({ [auto.code]: 5 })
        expect(
          await compute([], [shirt(100)], { customer: { id: "cus_1", group_ids: [], first_order: false } })
        ).toEqual({})
      })

      it("limits a coupon to customer groups and to chosen customers", async () => {
        const groups = await create(draft({ value: 5, audience: "groups", audience_ids: ["g_b2b"] }))
        const people = await create(draft({ value: 7, audience: "customers", audience_ids: ["cus_vip"] }))
        const b2b = { id: "cus_1", group_ids: ["g_b2b", "g_other"], first_order: false }
        expect(await compute([groups.code], [shirt(100)], { customer: b2b })).toEqual({ [groups.code]: 5 })
        expect(await compute([groups.code], [shirt(100)])).toEqual({})
        expect(
          await compute([people.code], [shirt(100)], { customer: { id: "cus_vip", group_ids: [], first_order: false } })
        ).toEqual({
          [people.code]: 7,
        })
        expect(await compute([people.code], [shirt(100)], { customer: b2b })).toEqual({})
      })
    })

    describe("usage limits", () => {
      it("refuses a code used up to its limit", async () => {
        const { code, ids } = await create(draft({ value: 10, usage_limit: 1 }))
        expect(await compute([code], [shirt(100)])).toEqual({ [code]: 10 })
        await service.updatePromotions({ id: ids[0], used: 1 } as never)
        expect(await compute([code], [shirt(100)])).toEqual({})
      })
    })
  },
})
