import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import type { PriceObservation, PriceRecordRow } from "../../../modules/compliance/service"
import { OMNIBUS_STARTED_KEY, toPoint } from "../../../modules/compliance/service"
import { toAmount } from "../format"
import { type LowestPriceResult, lowestPriceBeforeDiscount, ruleFor, withTax } from "../omnibus"
import type { ComplianceSettings } from "../settings"
import type { PriceSource } from "../types"
import { graph, graphAll, logger, moduleOn, resolveCompliance } from "./runtime"

type Row = Record<string, any>

export type Region = { id: string; currency_code: string; automatic_taxes: boolean; tax_country: string | null }

type Variant = {
  id: string
  product_id: string
  created_at: Date
  price_set_id: string | null
  product: {
    id: string
    title?: string
    categories: string[]
    collection_id: string | null
    type_id: string | null
    tags: string[]
  }
}

const VARIANT_FIELDS = [
  "id",
  "created_at",
  "product_id",
  "price_set.id",
  "product.id",
  "product.title",
  "product.status",
  "product.collection_id",
  "product.type_id",
  "product.categories.id",
  "product.tags.id",
]

export async function loadRegions(container: MedusaContainer, settings: ComplianceSettings): Promise<Region[]> {
  const { data } = await graph(container)({
    entity: "region",
    fields: ["id", "currency_code", "automatic_taxes", "countries.iso_2"],
  })
  return data.map((r: Row) => ({
    id: r.id,
    currency_code: String(r.currency_code).toLowerCase(),
    automatic_taxes: r.automatic_taxes !== false,
    tax_country:
      settings.omnibus.tax_country[r.id]?.toLowerCase() ??
      ((r.countries ?? []).map((c: Row) => c?.iso_2).filter(Boolean)[0] as string | undefined)?.toLowerCase() ??
      null,
  }))
}

async function loadVariants(container: MedusaContainer, variantIds?: string[]): Promise<Variant[]> {
  const rows = variantIds
    ? (await graph(container)({ entity: "product_variant", fields: VARIANT_FIELDS, filters: { id: variantIds } })).data
    : await graphAll(container, { entity: "product_variant", fields: VARIANT_FIELDS })
  return rows
    .filter((v: Row) => !v.product || v.product.status === undefined || v.product.status === "published")
    .map((v: Row) => ({
      id: v.id,
      product_id: v.product_id ?? v.product?.id,
      created_at: new Date(v.created_at),
      price_set_id: v.price_set?.id ?? null,
      product: {
        id: v.product_id ?? v.product?.id,
        title: v.product?.title,
        categories: (v.product?.categories ?? []).filter(Boolean).map((c: Row) => c.id),
        collection_id: v.product?.collection_id ?? null,
        type_id: v.product?.type_id ?? null,
        tags: (v.product?.tags ?? []).filter(Boolean).map((t: Row) => t.id),
      },
    }))
}

/** Tax rate in percent for each variant in a country, from the Tax Module (as the Store API does). */
async function taxRates(
  container: MedusaContainer,
  variants: Variant[],
  region: Region
): Promise<Map<string, number> | null> {
  const rates = new Map<string, number>()
  if (!region.automatic_taxes || !region.tax_country) return rates
  const tax = container.resolve(Modules.TAX) as unknown as {
    getTaxLines: (items: Row[], context: Row) => Promise<Array<{ line_item_id?: string; rate?: number }>>
  }
  try {
    const lines = await tax.getTaxLines(
      variants.map((v) => ({
        id: v.id,
        product_id: v.product_id,
        product_type_id: v.product.type_id,
        quantity: 1,
        unit_price: 0,
        currency_code: region.currency_code,
      })),
      { address: { country_code: region.tax_country } }
    )
    for (const line of lines) {
      if (line.line_item_id) rates.set(line.line_item_id, (rates.get(line.line_item_id) ?? 0) + Number(line.rate ?? 0))
    }
    return rates
  } catch (error) {
    logger(container).warn(
      `[compliance] Omnibus: no tax rates for region ${region.id} (${region.tax_country}); prices not recorded: ${(error as Error).message}`
    )
    return null
  }
}

type PromotionReduction = { amount: number; promotion_id: string }

/**
 * The best discount an automatic promotion (and, if enabled, a single code)
 * gives one unit of the variant, evaluated by the Promotion Module on a cart
 * with only this item. Promotions with cart conditions (customer group,
 * minimum subtotal…) do not apply to such a cart, so only discounts shown
 * on the product page are counted.
 */
async function promotionReduction(
  container: MedusaContainer,
  variant: Variant,
  region: Region,
  gross: number,
  codes: string[],
  automatic: boolean
): Promise<PromotionReduction | null> {
  const promotion = container.resolve(Modules.PROMOTION) as unknown as {
    computeActions: (codes: string[], context: Row, options?: Row) => Promise<Row[]>
    listPromotions: (filters: Row, config?: Row) => Promise<Row[]>
  }
  const context = {
    currency_code: region.currency_code,
    items: [
      {
        id: variant.id,
        quantity: 1,
        subtotal: gross,
        original_total: gross,
        is_discountable: true,
        variant_id: variant.id,
        product_id: variant.product_id,
        product: {
          id: variant.product_id,
          collection_id: variant.product.collection_id,
          type_id: variant.product.type_id,
          categories: variant.product.categories.map((id) => ({ id })),
          tags: variant.product.tags.map((id) => ({ id })),
        },
      },
    ],
  }
  const best = (actions: Row[]): PromotionReduction | null => {
    const byPromotion = new Map<string, number>()
    for (const action of actions) {
      if (action.action !== "addItemAdjustment" || action.item_id !== variant.id) continue
      const key = action.code ?? "auto"
      byPromotion.set(key, (byPromotion.get(key) ?? 0) + Number(action.amount ?? 0))
    }
    const total = [...byPromotion.values()].reduce((sum, amount) => sum + amount, 0)
    return total > 0 ? { amount: Math.round(total * 100) / 100, promotion_id: [...byPromotion.keys()].join(",") } : null
  }

  let result: PromotionReduction | null = null
  if (automatic) result = best(await promotion.computeActions([], context, { skip_usage_limit_checks: false }))
  for (const code of codes) {
    const withCode = best(await promotion.computeActions([code], context, { prevent_auto_promotions: true }))
    if (withCode && (!result || withCode.amount > result.amount)) result = withCode
  }
  return result
}

/**
 * The price every published variant has now in every region, with tax,
 * as the Store API would show it: the calculated price (a `sale` price list
 * counts as a discount; an `override` list is the regular price), then the
 * best automatic promotion on top if the settings count promotions.
 */
export async function observePrices(container: MedusaContainer, variantIds?: string[]): Promise<PriceObservation[]> {
  const service = resolveCompliance(container)
  const settings = await service.getSettings()
  const startedAt = await service.omnibusStartedAt()
  const variants = (await loadVariants(container, variantIds)).filter((v) => v.price_set_id)
  if (!variants.length) return []
  const regions = await loadRegions(container, settings)
  const pricing = container.resolve(Modules.PRICING) as unknown as {
    calculatePrices: (filters: Row, config: Row) => Promise<Row[]>
  }
  const promotion = container.resolve(Modules.PROMOTION) as unknown as {
    listPromotions: (filters: Row, config?: Row) => Promise<Row[]>
  }

  // Skip promotion evaluation entirely when nothing could apply.
  const activeAutomatic =
    settings.omnibus.automatic_promotions &&
    (await promotion.listPromotions({ is_automatic: true, status: "active" }, { take: 1, select: ["id"] })).length > 0
  const codes = settings.omnibus.code_promotions
    ? (await promotion.listPromotions({ is_automatic: false, status: "active" }, { take: 50, select: ["code"] }))
        .map((p) => p.code)
        .filter(Boolean)
    : []

  const observations: PriceObservation[] = []
  for (const region of regions) {
    const prices = await pricing.calculatePrices(
      { id: variants.map((v) => v.price_set_id) },
      { context: { currency_code: region.currency_code, region_id: region.id } }
    )
    const byPriceSet = new Map(prices.map((p) => [p.id, p]))
    const rates = await taxRates(container, variants, region)
    if (!rates) continue

    for (const variant of variants) {
      const price = byPriceSet.get(variant.price_set_id!)
      const calculated = toAmount(price?.calculated_amount)
      const original = toAmount(price?.original_amount)
      if (calculated == null || original == null) continue
      const rate = rates.get(variant.id) ?? 0
      let amount = withTax(calculated, rate, Boolean(price!.is_calculated_price_tax_inclusive))
      const regular = withTax(original, rate, Boolean(price!.is_original_price_tax_inclusive))

      const sale = price!.calculated_price?.price_list_type === "sale" && amount < regular
      let kind: PriceObservation["discount_kind"] = sale ? "price_list" : null
      let ref: string | null = sale ? (price!.calculated_price?.price_list_id ?? null) : null

      if (activeAutomatic || codes.length) {
        const reduction = await promotionReduction(container, variant, region, amount, codes, activeAutomatic)
        if (reduction) {
          amount = Math.max(0, Math.round((amount - reduction.amount) * 100) / 100)
          kind = "promotion"
          ref = sale && ref ? `${ref}+${reduction.promotion_id}` : reduction.promotion_id
        }
      }

      observations.push({
        variant_id: variant.id,
        product_id: variant.product_id,
        region_id: region.id,
        currency_code: region.currency_code,
        amount,
        regular_amount: regular,
        discounted: amount < regular,
        discount_kind: amount < regular ? kind : null,
        discount_ref: amount < regular ? ref : null,
        start_known: startedAt !== null && variant.created_at.getTime() >= startedAt.getTime(),
      })
    }
  }
  return observations
}

/**
 * Records current prices that changed. The first run takes a snapshot of
 * every price and remembers when history started.
 */
export async function recordPrices(
  container: MedusaContainer,
  options: { variantIds?: string[]; source: PriceSource; at?: Date } = { source: "job" }
): Promise<PriceRecordRow[]> {
  if (!(await moduleOn(container, "omnibus"))) return []
  const service = resolveCompliance(container)
  if (!(await service.omnibusStartedAt())) {
    const at = options.at ?? new Date()
    await service.setValue(OMNIBUS_STARTED_KEY, { at: at.toISOString() })
    const snapshot = await observePrices(container)
    const rows = await service.recordPrices(snapshot, { source: "snapshot", at })
    logger(container).info(`[compliance] Omnibus: price history started with ${rows.length} prices`)
    if (!options.variantIds) return rows
  }
  const observations = await observePrices(container, options.variantIds)
  return service.recordPrices(observations, { source: options.source, at: options.at })
}

export type VariantOmnibus = LowestPriceResult & {
  variant_id: string
  product_id: string
  region_id: string
  currency_code: string
}

/** The Omnibus view of variants: current, regular and lowest price per region. */
export async function omnibusFor(
  container: MedusaContainer,
  variantIds: string[],
  options: { region_id?: string; now?: Date } = {}
): Promise<VariantOmnibus[]> {
  if (!variantIds.length) return []
  const service = resolveCompliance(container)
  const settings = await service.getSettings()
  const history = await service.priceHistory(variantIds, { region_id: options.region_id })
  const { data: variants } = await graph(container)({
    entity: "product_variant",
    fields: ["id", "product_id", "product.categories.id"],
    filters: { id: variantIds },
  })
  const categories = new Map(
    variants.map((v: Row) => [v.id, (v.product?.categories ?? []).filter(Boolean).map((c: Row) => c.id) as string[]])
  )
  const series = new Map<string, PriceRecordRow[]>()
  for (const row of history) {
    const key = `${row.variant_id}|${row.region_id}|${row.currency_code}`
    series.set(key, [...(series.get(key) ?? []), row])
  }
  return [...series.values()].map((rows) => {
    const first = rows.find((r) => r.series_start) ?? rows[0]
    const head = rows[0]
    const rule = ruleFor(settings.omnibus.exceptions, head.product_id, categories.get(head.variant_id) ?? [])
    return {
      variant_id: head.variant_id,
      product_id: head.product_id,
      region_id: head.region_id,
      currency_code: head.currency_code,
      ...lowestPriceBeforeDiscount(rows.map(toPoint), {
        periodDays: settings.omnibus.period_days,
        start: { at: first.recorded_at, known: first.start_known },
        rule,
      }),
    }
  })
}

/** Variant ids affected by pricing events: price ids or price set ids → variants. */
export async function variantsForPriceSets(container: MedusaContainer, priceSetIds: string[]): Promise<string[]> {
  if (!priceSetIds.length) return []
  const { data } = await graph(container)({
    entity: "price_set",
    fields: ["id", "variant.id"],
    filters: { id: priceSetIds },
  })
  return [...new Set(data.map((p: Row) => p.variant?.id).filter(Boolean) as string[])]
}
