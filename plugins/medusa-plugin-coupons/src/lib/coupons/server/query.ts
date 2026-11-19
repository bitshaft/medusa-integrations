import type { IPromotionModuleService, MedusaContainer, RemoteQueryFunction } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { COUPONS_MODULE } from "../../../modules/coupons"
import type CouponsModuleService from "../../../modules/coupons/service"
import type { KnownPromotion, TierGroup } from "../context"
import { normalizeCode } from "../format"
import type { OrderForStats } from "../orders"
import type { CouponPromotionMetadata } from "../promotions"
import type { CouponDraft } from "../types"

export function resolveCoupons(container: MedusaContainer): CouponsModuleService {
  return container.resolve<CouponsModuleService>(COUPONS_MODULE)
}

export function resolveQuery(container: MedusaContainer): RemoteQueryFunction {
  return container.resolve(ContainerRegistrationKeys.QUERY) as unknown as RemoteQueryFunction
}

type Graph = (config: Record<string, unknown>) => Promise<{ data: unknown[]; metadata?: { count?: number } }>
const graph = (container: MedusaContainer): Graph =>
  (resolveQuery(container) as unknown as { graph: Graph }).graph.bind(resolveQuery(container))

/** The plugin's metadata on a promotion, or null for promotions created elsewhere. */
export function couponMetadata(metadata: unknown): CouponPromotionMetadata | null {
  if (!metadata || typeof metadata !== "object") return null
  const m = metadata as Record<string, unknown>
  if (typeof m.coupons_group !== "string") return null
  return {
    coupons_group: m.coupons_group,
    coupons_tier: typeof m.coupons_tier === "number" ? m.coupons_tier : null,
    coupons_exclusive: m.coupons_exclusive === true,
    coupons_entered: m.coupons_entered !== false,
  }
}

/** Promotions by code (as typed and upper-cased), with the plugin's metadata. */
export async function loadKnownPromotions(
  container: MedusaContainer,
  codes: string[]
): Promise<Map<string, KnownPromotion>> {
  const wanted = [...new Set(codes.flatMap((code) => [code, normalizeCode(code)]).filter(Boolean))]
  const result = new Map<string, KnownPromotion>()
  if (!wanted.length) return result
  const promotions = await container
    .resolve<IPromotionModuleService>(Modules.PROMOTION)
    .listPromotions({ code: wanted }, { select: ["id", "code", "is_automatic", "metadata"] })
  for (const promotion of promotions) {
    if (!promotion.code) continue
    const known = {
      code: promotion.code,
      is_automatic: !!promotion.is_automatic,
      coupon: couponMetadata(promotion.metadata),
    }
    result.set(promotion.code, known)
    result.set(normalizeCode(promotion.code), known)
  }
  return result
}

/** Tiered coupons customers can type, among the given codes. */
export async function loadTierGroups(container: MedusaContainer, codes: string[]): Promise<Map<string, TierGroup>> {
  const wanted = [...new Set(codes.map(normalizeCode).filter(Boolean))]
  const result = new Map<string, TierGroup>()
  if (!wanted.length) return result
  const rows = await resolveCoupons(container).listCouponsCoupons(
    { code: wanted, tiered: true, automatic: false },
    { select: ["code", "exclusive"] }
  )
  for (const row of rows) result.set(row.code, { group: row.code, exclusive: row.exclusive })
  return result
}

export type CustomerOrder = { id: string; codes: string[] }

/**
 * Earlier orders of a customer: by customer id when logged in, by e-mail for
 * guests. Cancelled orders and draft orders do not count.
 */
export async function loadCustomerOrders(
  container: MedusaContainer,
  who: { customer_id: string | null; email: string | null }
): Promise<CustomerOrder[]> {
  const filters = who.customer_id ? { customer_id: who.customer_id } : who.email ? { email: who.email } : null
  if (!filters) return []
  const { data } = await graph(container)({
    entity: "order",
    fields: ["id", "status", "is_draft_order", "items.adjustments.code", "shipping_methods.adjustments.code"],
    filters,
    pagination: { take: 1000 },
  })
  return (data as Array<Record<string, any>>)
    .filter((order) => order.status !== "canceled" && order.status !== "draft" && !order.is_draft_order)
    .map((order) => ({
      id: order.id,
      codes: [
        ...new Set(
          [...(order.items ?? []), ...(order.shipping_methods ?? [])]
            .flatMap((line: Record<string, any>) => line?.adjustments ?? [])
            .map((adjustment: Record<string, any>) => adjustment?.code)
            .filter((code: unknown): code is string => typeof code === "string")
        ),
      ],
    }))
}

/** Group ids of a customer, for carts loaded without `customer.groups` (cart completion). */
export async function loadCustomerGroupIds(container: MedusaContainer, customerId: string): Promise<string[]> {
  const { data } = await graph(container)({
    entity: "customer",
    fields: ["id", "groups.id"],
    filters: { id: customerId },
  })
  const customer = (data as Array<{ groups?: Array<{ id: string } | null> }>)[0]
  return (customer?.groups ?? []).filter((g): g is { id: string } => !!g).map((g) => g.id)
}

/** Whether the customer has no earlier orders; a cheap check used on every cart change. */
export async function isFirstOrder(
  container: MedusaContainer,
  who: { customer_id: string | null; email: string | null }
): Promise<boolean> {
  const filters = who.customer_id ? { customer_id: who.customer_id } : who.email ? { email: who.email } : null
  if (!filters) return true
  const { data } = await graph(container)({
    entity: "order",
    fields: ["id", "status", "is_draft_order"],
    filters,
    pagination: { take: 50 },
  })
  return !(data as Array<Record<string, any>>).some(
    (order) => order.status !== "canceled" && order.status !== "draft" && !order.is_draft_order
  )
}

export type PromotionRecord = {
  id: string
  code: string
  status: "draft" | "active" | "inactive"
  is_automatic: boolean
  limit: number | null
  used: number
  campaign_id: string | null
  starts_at: string | null
  ends_at: string | null
  budget_limit: number | null
  budget_used: number
}

export type CouponRow = {
  id: string
  code: string
  name: string | null
  kind: CouponDraft["kind"]
  automatic: boolean
  exclusive: boolean
  tiered: boolean
  batch_size: number | null
  batch_prefix: string | null
  draft: CouponDraft
  campaign_id: string | null
  created_at: string
  updated_at: string
}

export type CouponWithPromotions = CouponRow & { promotions: PromotionRecord[] }

const COUPON_FIELDS = [
  "id",
  "code",
  "name",
  "kind",
  "automatic",
  "exclusive",
  "tiered",
  "batch_size",
  "batch_prefix",
  "draft",
  "campaign_id",
  "created_at",
  "updated_at",
  "promotions.id",
  "promotions.code",
  "promotions.status",
  "promotions.is_automatic",
  "promotions.limit",
  "promotions.used",
  "promotions.campaign.id",
  "promotions.campaign.starts_at",
  "promotions.campaign.ends_at",
  "promotions.campaign.budget.limit",
  "promotions.campaign.budget.used",
]

const iso = (value: unknown): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : String(value)

function toPromotion(p: Record<string, any>): PromotionRecord {
  return {
    id: p.id,
    code: p.code,
    status: p.status,
    is_automatic: !!p.is_automatic,
    limit: p.limit ?? null,
    used: Number(p.used ?? 0),
    campaign_id: p.campaign?.id ?? null,
    starts_at: iso(p.campaign?.starts_at),
    ends_at: iso(p.campaign?.ends_at),
    budget_limit: p.campaign?.budget?.limit != null ? Number(p.campaign.budget.limit) : null,
    budget_used: Number(p.campaign?.budget?.used ?? 0),
  }
}

/** Coupons with their promotions, through the coupon ↔ promotion link. */
export async function loadCoupons(
  container: MedusaContainer,
  filters: Record<string, unknown> = {}
): Promise<CouponWithPromotions[]> {
  const { data } = await graph(container)({ entity: "coupons_coupon", fields: COUPON_FIELDS, filters })
  return (data as Array<Record<string, any>>).map((row) => ({
    ...(row as CouponRow),
    created_at: iso(row.created_at)!,
    updated_at: iso(row.updated_at)!,
    promotions: ((row.promotions ?? []) as Array<Record<string, any> | null>)
      .filter((p): p is Record<string, any> => !!p)
      .map(toPromotion),
  }))
}

/** Orders that used any of the given promotions, shaped for `statsByCode`. */
export async function loadOrdersForPromotions(
  container: MedusaContainer,
  promotionIds: string[],
  since?: Date
): Promise<OrderForStats[]> {
  if (!promotionIds.length) return []
  const run = graph(container)
  const orderIds = new Set<string>()
  for (let i = 0; i < promotionIds.length; i += 500) {
    const { data } = await run({
      entity: "order_promotion",
      fields: ["order_id"],
      filters: { promotion_id: promotionIds.slice(i, i + 500) },
    })
    for (const link of data as Array<{ order_id: string }>) orderIds.add(link.order_id)
  }
  if (!orderIds.size) return []

  const orders: OrderForStats[] = []
  const ids = [...orderIds]
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await run({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "created_at",
        "email",
        "customer_id",
        "currency_code",
        "status",
        "total",
        "items.adjustments.code",
        "items.adjustments.amount",
        "shipping_methods.adjustments.code",
        "shipping_methods.adjustments.amount",
      ],
      filters: { id: ids.slice(i, i + 200), ...(since ? { created_at: { $gte: since } } : {}) },
    })
    for (const order of data as Array<Record<string, any>>) {
      if (order.status === "canceled") continue
      orders.push({
        id: order.id,
        display_id: order.display_id ?? null,
        created_at: iso(order.created_at)!,
        email: order.email ?? null,
        customer_id: order.customer_id ?? null,
        currency_code: order.currency_code,
        total: Number(order.total ?? 0),
        adjustments: [...(order.items ?? []), ...(order.shipping_methods ?? [])]
          .flatMap((line: Record<string, any>) => line?.adjustments ?? [])
          .filter(Boolean)
          .map((a: Record<string, any>) => ({ code: a.code ?? null, amount: Number(a.amount ?? 0) })),
      })
    }
  }
  return orders.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

/** Names for ids shown in sentences: categories, customer groups and products. */
export async function loadNames(
  container: MedusaContainer,
  ids: { categories: string[]; groups: string[]; products: string[] }
): Promise<{ categories: Record<string, string>; groups: Record<string, string>; products: Record<string, string> }> {
  const run = graph(container)
  const pick = async (entity: string, list: string[], field: string) => {
    const unique = [...new Set(list)]
    if (!unique.length) return {}
    const { data } = await run({ entity, fields: ["id", field], filters: { id: unique } })
    return Object.fromEntries((data as Array<Record<string, string>>).map((row) => [row.id, row[field]]))
  }
  const [categories, groups, products] = await Promise.all([
    pick("product_category", ids.categories, "name"),
    pick("customer_group", ids.groups, "name"),
    pick("product", ids.products, "title"),
  ])
  return { categories, groups, products }
}

export type OrderCouponCode = {
  code: string
  promotion_id: string | null
  /** Total discount the code gave on this order (items and shipping). */
  discount: number
  automatic: boolean
  /** The coupon of this plugin that the code belongs to; null for promotions made elsewhere. */
  coupon: { id: string; code: string; name: string | null; kind: string; batch: boolean } | null
}

/** The promotion codes an order used, with the discount of each and the coupon it belongs to. */
export async function loadOrderCoupons(
  container: MedusaContainer,
  orderId: string
): Promise<{ currency_code: string | null; codes: OrderCouponCode[] }> {
  const run = graph(container)
  const { data } = await run({
    entity: "order",
    fields: [
      "id",
      "currency_code",
      "items.adjustments.code",
      "items.adjustments.amount",
      "items.adjustments.promotion_id",
      "shipping_methods.adjustments.code",
      "shipping_methods.adjustments.amount",
      "shipping_methods.adjustments.promotion_id",
    ],
    filters: { id: orderId },
  })
  const order = (data as Array<Record<string, any>>)[0]
  if (!order) return { currency_code: null, codes: [] }

  const byCode = new Map<string, { promotion_id: string | null; discount: number }>()
  for (const line of [...(order.items ?? []), ...(order.shipping_methods ?? [])]) {
    for (const adjustment of (line?.adjustments ?? []) as Array<Record<string, any>>) {
      if (!adjustment?.code) continue
      const entry = byCode.get(adjustment.code) ?? { promotion_id: adjustment.promotion_id ?? null, discount: 0 }
      entry.discount = Math.round((entry.discount + Number(adjustment.amount ?? 0)) * 100) / 100
      byCode.set(adjustment.code, entry)
    }
  }
  if (!byCode.size) return { currency_code: order.currency_code ?? null, codes: [] }

  const promotionIds = [...byCode.values()].map((entry) => entry.promotion_id).filter(Boolean) as string[]
  const promotions = promotionIds.length
    ? ((
        await run({
          entity: "promotion",
          fields: [
            "id",
            "code",
            "is_automatic",
            "coupons_coupon.id",
            "coupons_coupon.code",
            "coupons_coupon.name",
            "coupons_coupon.kind",
            "coupons_coupon.batch_size",
          ],
          filters: { id: promotionIds },
        })
      ).data as Array<Record<string, any>>)
    : []
  const promotionById = new Map(promotions.map((promotion) => [promotion.id, promotion]))

  return {
    currency_code: order.currency_code ?? null,
    codes: [...byCode].map(([code, entry]) => {
      const promotion = entry.promotion_id ? promotionById.get(entry.promotion_id) : undefined
      const coupon = promotion?.coupons_coupon
      return {
        code,
        promotion_id: entry.promotion_id,
        discount: entry.discount,
        automatic: Boolean(promotion?.is_automatic),
        coupon: coupon
          ? {
              id: coupon.id,
              code: coupon.code,
              name: coupon.name ?? null,
              kind: coupon.kind,
              batch: coupon.batch_size !== null && coupon.batch_size !== undefined,
            }
          : null,
      }
    }),
  }
}
