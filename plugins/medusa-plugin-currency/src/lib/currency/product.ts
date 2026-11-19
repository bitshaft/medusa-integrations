import type { MedusaContainer } from "@medusajs/framework/types"

import { loadStoreContext, loadVariants } from "./fill/load"
import { resolveCurrency } from "./runtime"
import { ruleFor } from "./settings"
import { sameAmount } from "./money"

export type PriceOriginView =
  | { kind: "manual" }
  | {
      kind: "filled"
      run_id: string
      at: string
      mode: string
      rate: string
      margin: string
      table: string | null
      rate_date: string | null
    }

/**
 * One product's prices per variant and currency, each with where it came
 * from: filled by this plugin (when, at which rate) or set by hand. Also
 * how many variants still lack a price in each currency to fill.
 */
export async function productPrices(container: MedusaContainer, productId: string) {
  const service = resolveCurrency(container)
  const options = await service.getOptions()
  const settings = await service.getSettings()
  const context = await loadStoreContext(container, settings)
  const { variants, priceLists } = await loadVariants(container, [productId], options.maxVariants)
  const records = await service.filledFor(variants.flatMap((variant) => variant.prices.map((price) => price.id)))
  const regions = new Map(context.regions.map((region) => [region.id, region.name]))
  const base = context.base?.code ?? null
  const targets = context.currencies
    .filter((currency) => currency.code !== base && ruleFor(settings, currency.code).enabled)
    .map((currency) => currency.code)

  const missing: Record<string, number> = Object.fromEntries(targets.map((code) => [code, 0]))
  const rows = variants.map((variant) => {
    const plain = variant.prices.filter((price) => !price.price_list_id && !price.region_id && !price.other_rules)
    const lacking = targets.filter((code) => !plain.some((price) => price.currency === code))
    for (const code of lacking) missing[code]++
    return {
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      has_base: Boolean(base && plain.some((price) => price.currency === base)),
      missing: lacking,
      prices: variant.prices
        .filter((price) => !price.other_rules)
        .map((price) => {
          const record = records[price.id]
          const origin: PriceOriginView =
            record && sameAmount(record.amount, price.amount)
              ? {
                  kind: "filled",
                  run_id: record.run_id,
                  at: record.created_at.toISOString(),
                  mode: record.mode,
                  rate: record.rate,
                  margin: record.margin,
                  table: record.table_no,
                  rate_date: record.rate_date,
                }
              : { kind: "manual" }
          return {
            id: price.id,
            currency: price.currency,
            amount: price.amount,
            price_list_id: price.price_list_id,
            price_list_title: price.price_list_id ? (priceLists[price.price_list_id]?.title ?? null) : null,
            region_id: price.region_id,
            region_name: price.region_id ? (regions.get(price.region_id) ?? null) : null,
            min_quantity: price.min_quantity,
            max_quantity: price.max_quantity,
            origin: price.currency === base ? null : origin,
          }
        }),
    }
  })

  return {
    demo: options.demo,
    base,
    targets,
    currencies: context.currencies,
    missing,
    variants: rows,
  }
}
