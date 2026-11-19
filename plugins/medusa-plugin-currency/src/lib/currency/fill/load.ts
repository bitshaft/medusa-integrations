import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

import type { Settings } from "../settings"
import type { PlanPrice, PlanRegion, PlanVariant } from "./plan"

/**
 * Reads what a fill needs from Medusa's modules: store currencies, regions,
 * VAT rates, "tax inclusive pricing", and the variants of a scope with their
 * prices. Nothing here writes.
 */

type Row = Record<string, any>

export type FillScope =
  | { kind: "products"; ids: string[] }
  | { kind: "collection"; id: string }
  | { kind: "category"; id: string }
  | { kind: "demo" }

export type StoreCurrency = { code: string; name: string; symbol: string; decimals: number; is_default: boolean }

export type StoreContext = {
  currencies: StoreCurrency[]
  /** The currency prices are filled from. */
  base: StoreCurrency | null
  regions: PlanRegion[]
  taxInclusive: { currency: Record<string, boolean>; region: Record<string, boolean> }
  /** Default VAT rate in percent per country of any region; null when the country has none. */
  taxRates: Record<string, string | null>
  /** The base prices' tax country: the setting, else the first country of the base currency's first region. */
  baseTaxCountry: string | null
}

const lower = (value: unknown) => String(value ?? "").toLowerCase()

export async function loadStoreContext(container: MedusaContainer, settings: Settings): Promise<StoreContext> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id", "supported_currencies.currency_code", "supported_currencies.is_default"],
  })
  const supported = ((stores[0] as Row | undefined)?.supported_currencies ?? []) as Row[]
  const codes = supported.map((row) => lower(row.currency_code))

  const currencyModule = container.resolve(Modules.CURRENCY)
  const details = codes.length ? await currencyModule.listCurrencies({ code: codes }) : []
  const byCode = new Map(details.map((currency) => [lower(currency.code), currency]))
  const currencies: StoreCurrency[] = supported.map((row) => {
    const code = lower(row.currency_code)
    const detail = byCode.get(code) as Row | undefined
    return {
      code,
      name: detail?.name ?? code.toUpperCase(),
      symbol: detail?.symbol_native ?? detail?.symbol ?? code.toUpperCase(),
      decimals: Number(detail?.decimal_digits ?? 2),
      is_default: Boolean(row.is_default),
    }
  })

  const regionModule = container.resolve(Modules.REGION)
  const regionRows = (await regionModule.listRegions({}, { relations: ["countries"], take: 1000 })) as Row[]
  const regions: PlanRegion[] = regionRows.map((region) => ({
    id: region.id,
    name: region.name,
    currency: lower(region.currency_code),
    countries: ((region.countries ?? []) as Row[]).map((country) => lower(country.iso_2)).sort(),
  }))

  const pricing = container.resolve(Modules.PRICING)
  const preferences = (await pricing.listPricePreferences({}, { take: 10_000 })) as Row[]
  const taxInclusive = { currency: {} as Record<string, boolean>, region: {} as Record<string, boolean> }
  for (const preference of preferences) {
    if (preference.attribute === "currency_code" && preference.value) {
      taxInclusive.currency[lower(preference.value)] = Boolean(preference.is_tax_inclusive)
    } else if (preference.attribute === "region_id" && preference.value) {
      taxInclusive.region[preference.value] = Boolean(preference.is_tax_inclusive)
    }
  }

  const countries = [...new Set(regions.flatMap((region) => region.countries))]
  const taxRates: Record<string, string | null> = Object.fromEntries(countries.map((country) => [country, null]))
  if (countries.length) {
    const taxModule = container.resolve(Modules.TAX)
    const taxRegions = (await taxModule.listTaxRegions({ country_code: countries, parent_id: null } as never, {
      relations: ["tax_rates"],
      take: 1000,
    })) as Row[]
    for (const taxRegion of taxRegions) {
      if (taxRegion.province_code) continue
      const rate = ((taxRegion.tax_rates ?? []) as Row[]).find((tax) => tax.is_default)
      if (rate && rate.rate !== null && rate.rate !== undefined) {
        taxRates[lower(taxRegion.country_code)] = String(rate.rate)
      }
    }
  }

  const baseCode = settings.baseCurrency ?? currencies.find((c) => c.is_default)?.code ?? currencies[0]?.code ?? null
  const base = currencies.find((currency) => currency.code === baseCode) ?? null
  const baseRegion = regions
    .filter((region) => region.currency === baseCode)
    .sort((a, b) => a.name.localeCompare(b.name))[0]

  return {
    currencies,
    base,
    regions,
    taxInclusive,
    taxRates,
    baseTaxCountry: settings.baseTaxCountry ?? baseRegion?.countries[0] ?? null,
  }
}

/** The product ids of a scope (a category includes its subcategories). */
export async function productIdsOf(container: MedusaContainer, scope: FillScope): Promise<string[]> {
  const products = container.resolve(Modules.PRODUCT)
  if (scope.kind === "products") return [...new Set(scope.ids)]
  if (scope.kind === "collection") {
    const rows = await products.listProducts({ collection_id: scope.id }, { select: ["id"], take: 100_000 })
    return rows.map((row) => row.id)
  }
  if (scope.kind === "category") {
    const categories = (await products.listProductCategories(
      {},
      { select: ["id", "parent_category_id"], take: 100_000 }
    )) as Row[]
    const ids = new Set([scope.id])
    for (let grew = true; grew;) {
      grew = false
      for (const category of categories) {
        if (category.parent_category_id && ids.has(category.parent_category_id) && !ids.has(category.id)) {
          ids.add(category.id)
          grew = true
        }
      }
    }
    const rows = await products.listProducts({ categories: { id: [...ids] } } as never, {
      select: ["id"],
      take: 100_000,
    })
    return rows.map((row) => row.id)
  }
  return []
}

/** Variants of the products with all their prices. */
export async function loadVariants(
  container: MedusaContainer,
  productIds: string[],
  maxVariants: number
): Promise<{ variants: PlanVariant[]; priceLists: Record<string, { title: string; status: string }> }> {
  if (!productIds.length) return { variants: [], priceLists: {} }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data, metadata } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "sku", "product_id", "variant_rank", "product.title", "product.thumbnail", "price_set.id"],
    filters: { product_id: productIds },
    pagination: { take: maxVariants + 1, skip: 0 },
  })
  const rows = data as Row[]
  const total = Number((metadata as Row | undefined)?.count ?? rows.length)
  if (rows.length > maxVariants || total > maxVariants) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `This covers ${total} variants; one fill can cover at most ${maxVariants}. Choose fewer products, or raise the plugin option maxVariants.`
    )
  }

  const setIds = rows.map((row) => row.price_set?.id).filter(Boolean) as string[]
  const pricing = container.resolve(Modules.PRICING)
  const prices: Row[] = []
  for (let i = 0; i < setIds.length; i += 500) {
    prices.push(
      ...((await pricing.listPrices({ price_set_id: setIds.slice(i, i + 500) } as never, {
        relations: ["price_rules", "price_list"],
        take: 100_000,
      })) as Row[])
    )
  }
  const priceLists: Record<string, { title: string; status: string }> = {}
  const bySet = new Map<string, PlanPrice[]>()
  for (const price of prices) {
    const listId = price.price_list_id ?? price.price_list?.id ?? null
    if (listId && price.price_list) {
      priceLists[listId] = { title: price.price_list.title ?? listId, status: price.price_list.status ?? "active" }
    }
    const rules = (price.price_rules ?? []) as Row[]
    const region = rules.find((rule) => rule.attribute === "region_id")
    const planPrice: PlanPrice = {
      id: price.id,
      currency: lower(price.currency_code),
      amount: String(price.raw_amount?.value ?? price.amount),
      price_list_id: listId,
      region_id: region?.value ?? null,
      min_quantity: price.min_quantity === null || price.min_quantity === undefined ? null : String(price.min_quantity),
      max_quantity: price.max_quantity === null || price.max_quantity === undefined ? null : String(price.max_quantity),
      other_rules: rules.some((rule) => rule.attribute !== "region_id"),
    }
    const setId = price.price_set_id ?? price.price_set?.id
    bySet.set(setId, [...(bySet.get(setId) ?? []), planPrice])
  }

  const variants = rows
    .map((row): PlanVariant => ({
      id: row.id,
      title: row.title ?? null,
      sku: row.sku ?? null,
      product_id: row.product_id,
      product_title: row.product?.title ?? row.product_id,
      thumbnail: row.product?.thumbnail ?? null,
      price_set_id: row.price_set?.id ?? null,
      prices: row.price_set?.id ? (bySet.get(row.price_set.id) ?? []) : [],
    }))
    .sort(
      (a, b) =>
        productIds.indexOf(a.product_id) - productIds.indexOf(b.product_id) ||
        (rows.find((r) => r.id === a.id)?.variant_rank ?? 0) - (rows.find((r) => r.id === b.id)?.variant_rank ?? 0)
    )
  return { variants, priceLists }
}
