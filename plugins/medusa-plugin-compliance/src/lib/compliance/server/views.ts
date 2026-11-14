import type { MedusaContainer } from "@medusajs/framework/types"

import { daysLeft, OPEN_STATUSES } from "../requests"
import { omnibusFor, type VariantOmnibus } from "./prices"
import { graph, resolveCompliance } from "./runtime"

type Row = Record<string, any>

export type DashboardView = {
  modules: { gpsr: boolean; gdpr: boolean; omnibus: boolean }
  gpsr: { products: number; incomplete: number; checked_at: string | null }
  gdpr: {
    open: number
    unverified: number
    due_soon: number
    overdue: number
    next_deadline: { id: string; type: string; deadline_at: string; days_left: number } | null
  }
  omnibus: { started_at: string | null; discounted_products: number; incomplete: number }
}

export async function dashboard(container: MedusaContainer, now = new Date()): Promise<DashboardView> {
  const service = resolveCompliance(container)
  const settings = await service.getSettings()

  const [products, incomplete] = await Promise.all([
    service.listAndCountComplianceProductSafeties({}, { take: 1, order: { checked_at: "DESC" } }),
    service.listAndCountComplianceProductSafeties({ complete: false }, { take: 1 }),
  ])

  const open = await service.listComplianceRequests(
    { status: OPEN_STATUSES },
    { order: { deadline_at: "ASC" }, take: 1000 }
  )
  const [, unverified] = await service.listAndCountComplianceRequests({ status: "unverified" }, { take: 1 })
  const withDays = open.filter((r) => r.deadline_at).map((r) => ({ r, days: daysLeft(new Date(r.deadline_at!), now) }))
  const next = withDays[0]

  const discounts = settings.modules.omnibus ? await discountRows(container) : []

  return {
    modules: settings.modules,
    gpsr: {
      products: products[1],
      incomplete: incomplete[1],
      checked_at: products[0][0]?.checked_at ? new Date(products[0][0].checked_at).toISOString() : null,
    },
    gdpr: {
      open: open.length,
      unverified,
      due_soon: withDays.filter((x) => x.days >= 0 && x.days <= settings.gdpr.warn_days).length,
      overdue: withDays.filter((x) => x.days < 0).length,
      next_deadline: next
        ? {
            id: next.r.id,
            type: next.r.type,
            deadline_at: new Date(next.r.deadline_at!).toISOString(),
            days_left: next.days,
          }
        : null,
    },
    omnibus: {
      started_at: (await service.omnibusStartedAt())?.toISOString() ?? null,
      discounted_products: new Set(discounts.map((d) => d.product_id)).size,
      incomplete: discounts.filter((d) => d.history_incomplete).length,
    },
  }
}

export type DiscountRow = VariantOmnibus & {
  product_title: string | null
  variant_title: string | null
  sku: string | null
  region_name: string | null
}

/** Every variant and region whose current price is a discount, with its lowest prior price. */
export async function discountRows(container: MedusaContainer): Promise<DiscountRow[]> {
  const service = resolveCompliance(container)
  const discounted = await service.discountedSeries()
  const variantIds = [...new Set(discounted.map((d) => d.variant_id))]
  if (!variantIds.length) return []
  const keys = new Set(discounted.map((d) => `${d.variant_id}|${d.region_id}|${d.currency_code}`))
  const rows = (await omnibusFor(container, variantIds)).filter(
    (r) => r.discounted && keys.has(`${r.variant_id}|${r.region_id}|${r.currency_code}`)
  )
  const [{ data: variants }, { data: regions }] = await Promise.all([
    graph(container)({
      entity: "product_variant",
      fields: ["id", "title", "sku", "product.title"],
      filters: { id: variantIds },
    }),
    graph(container)({ entity: "region", fields: ["id", "name"] }),
  ])
  const variantById = new Map(variants.map((v: Row) => [v.id, v]))
  const regionById = new Map(regions.map((r: Row) => [r.id, r.name]))
  return rows
    .map((r) => {
      const v = variantById.get(r.variant_id)
      return {
        ...r,
        product_title: v?.product?.title ?? null,
        variant_title: v?.title ?? null,
        sku: v?.sku ?? null,
        region_name: regionById.get(r.region_id) ?? null,
      }
    })
    .sort((a, b) => (b.discount_started_at?.getTime() ?? 0) - (a.discount_started_at?.getTime() ?? 0))
}

/** Price history of a product's variants, grouped by series, with the Omnibus result of each. */
export async function productPriceHistory(container: MedusaContainer, productId: string) {
  const { data: variants } = await graph(container)({
    entity: "product_variant",
    fields: ["id", "title", "sku"],
    filters: { product_id: productId },
  })
  const ids = variants.map((v: Row) => v.id as string)
  const service = resolveCompliance(container)
  const [history, summary, { data: regions }] = await Promise.all([
    service.priceHistory(ids),
    omnibusFor(container, ids),
    graph(container)({ entity: "region", fields: ["id", "name"] }),
  ])
  const regionById = new Map(regions.map((r: Row) => [r.id, r.name]))
  return {
    started_at: (await service.omnibusStartedAt())?.toISOString() ?? null,
    series: summary.map((s) => ({
      ...s,
      variant_title: variants.find((v: Row) => v.id === s.variant_id)?.title ?? null,
      sku: variants.find((v: Row) => v.id === s.variant_id)?.sku ?? null,
      region_name: regionById.get(s.region_id) ?? null,
      points: history
        .filter(
          (h) => h.variant_id === s.variant_id && h.region_id === s.region_id && h.currency_code === s.currency_code
        )
        .map((h) => ({
          at: h.recorded_at.toISOString(),
          amount: h.amount,
          regular: h.regular_amount,
          discounted: h.discounted,
          kind: h.discount_kind,
          source: h.source,
        })),
    })),
  }
}
