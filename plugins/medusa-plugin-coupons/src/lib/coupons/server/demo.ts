import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { type CouponDraft, EMPTY_EXCLUSIONS } from "../types"
import { createBatch, createCoupon, deleteCoupon } from "./admin"
import { loadCoupons, resolveCoupons } from "./query"

/** Demo coupons are the ones whose name starts with this; a restore deletes only those. */
export const DEMO_NAME_PREFIX = "[Demo] "

const DAY = 86_400_000

type Row = Record<string, any>

type DemoCatalog = { categoryId: string | null; productIds: string[]; groupId: string | null }

export type DemoCoupon = {
  name: string
  draft: CouponDraft
  paused?: boolean
  batch?: { prefix: string; quantity: number }
}

const draft = (patch: Partial<CouponDraft>): CouponDraft => ({
  kind: "percentage",
  value: null,
  currency_code: null,
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
  ...patch,
})

/**
 * The demo set: every kind (percentage, amount, free shipping, category,
 * buy X get Y), tiers, an automatic coupon, limits, a first-order coupon, a
 * customer group, exclusions, every status (active, ending soon,
 * scheduled, ended, paused) and a batch of single-use codes. Coupons that
 * need store data (a category, products, a customer group) are left out
 * when the store has none.
 */
export function demoCoupons(now: Date, catalog: DemoCatalog): DemoCoupon[] {
  const iso = (days: number) => new Date(now.getTime() + days * DAY).toISOString()
  const coupons: DemoCoupon[] = [
    {
      name: "Powitalny rabat na pierwsze zamówienie",
      draft: draft({
        kind: "percentage",
        value: 10,
        code: "DEMO-WITAJ10",
        first_order_only: true,
        per_customer_limit: 1,
      }),
    },
    {
      name: "Rabat kwotowy od minimalnego koszyka, kończy się za 5 dni",
      draft: draft({
        kind: "fixed",
        value: 50,
        code: "DEMO-50OFF",
        min_subtotal: 300,
        usage_limit: 100,
        starts_at: iso(-20),
        ends_at: iso(5),
        exclusions: { ...EMPTY_EXCLUSIONS, product_ids: catalog.productIds.slice(0, 1), skip_discounted: true },
      }),
    },
    {
      name: "Darmowa dostawa od minimalnego koszyka (automatyczna)",
      draft: draft({ kind: "free_shipping", automatic: true, min_subtotal: 200 }),
    },
    {
      name: "Progi: im większy koszyk, tym większy rabat",
      draft: draft({
        kind: "percentage",
        code: "DEMO-PROGI",
        exclusive: true,
        tiers: [
          { min: 200, value: 5 },
          { min: 500, value: 10 },
          { min: 1000, value: 15 },
        ],
      }),
    },
    {
      name: "Black Week: zaplanowany",
      draft: draft({ kind: "percentage", value: 30, code: "DEMO-BLACK30", starts_at: iso(7), ends_at: iso(14) }),
    },
    {
      name: "Wyprzedaż letnia: zakończona",
      draft: draft({ kind: "percentage", value: 25, code: "DEMO-LATO25", starts_at: iso(-90), ends_at: iso(-30) }),
    },
    {
      name: "Wstrzymany kupon dla influencera",
      draft: draft({ kind: "fixed", value: 30, code: "DEMO-INFLUENCER", per_customer_limit: 1, usage_limit: 200 }),
      paused: true,
    },
    {
      name: "Kody jednorazowe do newslettera",
      draft: draft({ kind: "fixed", value: 20, min_subtotal: 100, ends_at: iso(60) }),
      batch: { prefix: "DEMO-NL", quantity: 25 },
    },
  ]
  if (catalog.categoryId) {
    coupons.push({
      name: "20% na wybraną kategorię",
      draft: draft({ kind: "category", value: 20, code: "DEMO-KATEGORIA20", category_ids: [catalog.categoryId] }),
    })
  }
  if (catalog.productIds.length) {
    coupons.push({
      name: "Kup 2, trzeci gratis",
      draft: draft({
        kind: "buy_get",
        value: 100,
        code: "DEMO-2PLUS1",
        buy_qty: 2,
        get_qty: 1,
        buy_product_ids: catalog.productIds.slice(0, 3),
      }),
    })
  }
  if (catalog.groupId) {
    coupons.push({
      name: "15% dla grupy klientów",
      draft: draft({
        kind: "percentage",
        value: 15,
        code: "DEMO-VIP15",
        audience: "groups",
        audience_ids: [catalog.groupId],
      }),
    })
  }
  return coupons.map((coupon) => ({ ...coupon, name: `${DEMO_NAME_PREFIX}${coupon.name}` }))
}

/**
 * "Restore test data" (demo mode only): deletes the demo coupons (and their
 * promotions and campaigns) and creates the demo set again through the
 * same path as the wizard. Real coupons are never touched.
 */
export async function resetCouponsDemo(container: MedusaContainer, now = new Date()) {
  const existing = (await loadCoupons(container)).filter((c) => c.name?.startsWith(DEMO_NAME_PREFIX))
  for (const coupon of existing) {
    await deleteCoupon(container, coupon.id)
  }
  const coupons = demoCoupons(now, await demoCatalog(container))
  let codes = 0
  for (const coupon of coupons) {
    if (coupon.batch) {
      const result = await createBatch(container, { draft: coupon.draft, name: coupon.name, ...coupon.batch })
      codes += result.quantity
    } else {
      await createCoupon(container, { draft: coupon.draft, name: coupon.name, paused: coupon.paused })
      codes += 1
    }
  }
  return { removed: existing.length, coupons: coupons.length, codes }
}

async function demoCatalog(container: MedusaContainer): Promise<DemoCatalog> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const read = async (entity: string, fields: string[], take: number): Promise<Row[]> => {
    try {
      return (await query.graph({ entity, fields, pagination: { take } })).data as Row[]
    } catch {
      return []
    }
  }
  const [categories, products, groups] = await Promise.all([
    read("product_category", ["id"], 1),
    read("product", ["id", "status"], 20),
    read("customer_group", ["id"], 1),
  ])
  return {
    categoryId: categories[0]?.id ?? null,
    productIds: products.filter((p) => p?.status === "published").map((p) => p.id),
    groupId: groups[0]?.id ?? null,
  }
}

/** Whether demo mode is on (for the route). */
export async function demoEnabled(container: MedusaContainer): Promise<boolean> {
  return (await resolveCoupons(container).getOptions()).demo
}
