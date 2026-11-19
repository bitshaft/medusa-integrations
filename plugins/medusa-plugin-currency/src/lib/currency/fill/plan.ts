import { createHash } from "node:crypto"

import { convertAmount, type ResolvedRate, sameAmount, type TaxStep } from "../money"
import type { RateProblem } from "../rates"
import type { CurrencyRule } from "../settings"

/**
 * The preview: for every variant in scope, every price slot of the base
 * currency, and every chosen target currency, what would happen. Pure: the
 * loader (`load.ts`) gathers the data, this decides. The write applies
 * exactly these rows, and only when a fresh plan has the same fingerprint.
 */

/** One price as the plan sees it. Amounts are decimal strings in major units. */
export type PlanPrice = {
  id: string
  currency: string
  amount: string
  price_list_id: string | null
  region_id: string | null
  min_quantity: string | null
  max_quantity: string | null
  /** Rules other than `region_id` (customer group, …): such prices are neither a source nor a target. */
  other_rules: boolean
}

export type PlanVariant = {
  id: string
  title: string | null
  sku: string | null
  product_id: string
  product_title: string
  thumbnail: string | null
  price_set_id: string | null
  prices: PlanPrice[]
}

export type PlanRegion = { id: string; name: string; currency: string; countries: string[] }

export type PlanTarget = {
  code: string
  decimals: number
  rule: CurrencyRule
  rate: { ok: true; rate: ResolvedRate } | { ok: false; reason: RateProblem }
}

export type PlanOptions = {
  /** Also replace prices that are already set. */
  overwrite: boolean
  /** Also fill prices inside price lists (from the same list's base price). */
  priceLists: boolean
  /** Also fill region prices (from the base currency's region price). */
  regionPrices: boolean
}

export type PlanData = {
  base: { code: string; decimals: number }
  /** The country whose VAT the base prices carry. */
  baseTaxCountry: string | null
  targets: PlanTarget[]
  variants: PlanVariant[]
  regions: PlanRegion[]
  priceLists: Record<string, { title: string; status: string }>
  /** Medusa's "tax inclusive pricing", per currency and per region. */
  taxInclusive: { currency: Record<string, boolean>; region: Record<string, boolean> }
  /** VAT in percent per country (the country's default rate); null when none is set. */
  taxRates: Record<string, string | null>
  /** Prices this plugin wrote, and the amount it wrote (to tell filled from manual). */
  filled: Record<string, { amount: string; run_id: string; created_at: string; rate: string; table: string | null }>
  options: PlanOptions
}

export type SkipReason =
  "no_price_set" | "no_base_price" | "already_set" | "same_amount" | "tax_rate_missing" | RateProblem

export type PlanAction = "add" | "overwrite" | "skip"

export type PriceOrigin =
  { kind: "manual" } | { kind: "filled"; run_id: string; at: string; rate: string; table: string | null }

export type PlanRow = {
  key: string
  variant_id: string
  variant_title: string | null
  sku: string | null
  product_id: string
  product_title: string
  thumbnail: string | null
  price_set_id: string | null
  currency: string
  price_list_id: string | null
  price_list_title: string | null
  region_id: string | null
  region_name: string | null
  min_quantity: string | null
  max_quantity: string | null
  base_price_id: string | null
  base_amount: string | null
  current: { id: string; amount: string; origin: PriceOrigin } | null
  new_amount: string | null
  rate: ResolvedRate | null
  tax: TaxStep | null
  /** VAT in percent on each side, when the conversion used it. */
  tax_rates: { base: string | null; target: string | null } | null
  action: PlanAction
  reason: SkipReason | null
  warnings: Array<"tax_differs" | "rounding_fallback" | "stale_rate">
}

export type Plan = {
  rows: PlanRow[]
  counts: { add: number; overwrite: number; skip: number }
  /** Changes when any base price, current price, rate or decision changes. */
  fingerprint: string
}

/** Where a price sits: same list, same region, same quantity range. */
type Slot = Pick<PlanPrice, "price_list_id" | "region_id" | "min_quantity" | "max_quantity">

const sameSlot = (a: Slot, b: Slot) =>
  a.price_list_id === b.price_list_id &&
  a.region_id === b.region_id &&
  (a.min_quantity ?? null) === (b.min_quantity ?? null) &&
  (a.max_quantity ?? null) === (b.max_quantity ?? null)

/**
 * The tax country for a price. A currency price (no region) carries the
 * chosen country, else the first country of the currency's first region. A
 * region price carries the chosen country when it is in that region, else
 * the region's first country.
 */
export function taxCountryFor(chosen: string | null, region: PlanRegion | undefined, regional: boolean): string | null {
  if (!region) return chosen
  if (chosen && (!regional || region.countries.includes(chosen))) return chosen
  return [...region.countries].sort()[0] ?? chosen
}

export function computePlan(data: PlanData): Plan {
  const base = data.base.code
  const regionsById = new Map(data.regions.map((region) => [region.id, region]))
  const regionsOf = (currency: string) =>
    data.regions.filter((region) => region.currency === currency).sort((a, b) => a.name.localeCompare(b.name))
  const firstRegion = (currency: string) => regionsOf(currency)[0]
  const rateOf = (country: string | null) => (country ? (data.taxRates[country] ?? null) : null)
  const inclusive = (currency: string, regionId: string | null) =>
    regionId && regionId in data.taxInclusive.region
      ? data.taxInclusive.region[regionId]
      : (data.taxInclusive.currency[currency] ?? false)
  const originOf = (price: PlanPrice): PriceOrigin => {
    const record = data.filled[price.id]
    return record && sameAmount(record.amount, price.amount)
      ? { kind: "filled", run_id: record.run_id, at: record.created_at, rate: record.rate, table: record.table }
      : { kind: "manual" }
  }

  const rows: PlanRow[] = []
  for (const variant of data.variants) {
    const usable = variant.prices.filter((price) => !price.other_rules)
    const sources = usable.filter(
      (price) =>
        price.currency === base &&
        (data.options.priceLists || !price.price_list_id) &&
        (data.options.regionPrices || !price.region_id)
    )
    // Several region prices in the base currency: one per base region; each fills the target regions once.
    const regionSources = new Map<string, PlanPrice>()
    for (const price of sources.filter((p) => p.region_id)) {
      const key = `${price.price_list_id}|${price.min_quantity}|${price.max_quantity}`
      const preferred = regionsById.get(price.region_id!)?.countries.includes(data.baseTaxCountry ?? "")
      if (!regionSources.has(key) || preferred) regionSources.set(key, price)
    }

    for (const target of data.targets) {
      const row = (slot: Slot & { region_name?: string | null }, source: PlanPrice | null): PlanRow => {
        const current = usable.find((price) => price.currency === target.code && sameSlot(price, slot)) ?? null
        const out: PlanRow = {
          key: [
            variant.id,
            target.code,
            slot.price_list_id ?? "-",
            slot.region_id ?? "-",
            slot.min_quantity ?? "-",
            slot.max_quantity ?? "-",
          ].join("|"),
          variant_id: variant.id,
          variant_title: variant.title,
          sku: variant.sku,
          product_id: variant.product_id,
          product_title: variant.product_title,
          thumbnail: variant.thumbnail,
          price_set_id: variant.price_set_id,
          currency: target.code,
          price_list_id: slot.price_list_id,
          price_list_title: slot.price_list_id ? (data.priceLists[slot.price_list_id]?.title ?? null) : null,
          region_id: slot.region_id,
          region_name: slot.region_id ? (regionsById.get(slot.region_id)?.name ?? null) : null,
          min_quantity: slot.min_quantity,
          max_quantity: slot.max_quantity,
          base_price_id: source?.id ?? null,
          base_amount: source?.amount ?? null,
          current: current ? { id: current.id, amount: current.amount, origin: originOf(current) } : null,
          new_amount: null,
          rate: target.rate.ok ? target.rate.rate : null,
          tax: null,
          tax_rates: null,
          action: "skip",
          reason: null,
          warnings: [],
        }
        if (!variant.price_set_id) return { ...out, reason: "no_price_set" }
        if (!source) return { ...out, reason: "no_base_price" }
        if (!target.rate.ok) return { ...out, reason: target.rate.reason }

        const baseRegion = source.region_id ? regionsById.get(source.region_id) : firstRegion(base)
        const targetRegion = slot.region_id ? regionsById.get(slot.region_id) : firstRegion(target.code)
        const baseRate = rateOf(taxCountryFor(data.baseTaxCountry, baseRegion, Boolean(source.region_id)))
        const targetRate = rateOf(taxCountryFor(target.rule.taxCountry, targetRegion, Boolean(slot.region_id)))
        const conversion = convertAmount({
          amount: source.amount,
          rate: target.rate.rate,
          decimals: target.decimals,
          rounding: target.rule.rounding,
          tax: target.rule.tax,
          base: { inclusive: inclusive(base, source.region_id), rate: baseRate },
          target: { inclusive: inclusive(target.code, slot.region_id), rate: targetRate },
        })
        if (!conversion.ok) return { ...out, reason: conversion.reason }

        const filled: PlanRow = {
          ...out,
          new_amount: conversion.amount,
          tax: conversion.tax,
          tax_rates: { base: baseRate, target: targetRate },
          warnings: [...conversion.warnings, ...(target.rate.rate.source?.stale ? (["stale_rate"] as const) : [])],
        }
        if (!current) return { ...filled, action: "add" }
        if (sameAmount(current.amount, conversion.amount)) return { ...filled, reason: "same_amount" }
        if (!data.options.overwrite) return { ...filled, reason: "already_set" }
        return { ...filled, action: "overwrite" }
      }

      const plain = sources.filter((price) => !price.region_id)
      if (!plain.some((price) => !price.price_list_id)) {
        // No base price: one row says so (lists and regions have nothing to start from either).
        rows.push(row({ price_list_id: null, region_id: null, min_quantity: null, max_quantity: null }, null))
      }
      for (const source of plain) {
        rows.push(row(source, source))
      }
      for (const source of regionSources.values()) {
        for (const region of regionsOf(target.code)) {
          rows.push(row({ ...source, region_id: region.id }, source))
        }
      }
    }
  }

  const counts = { add: 0, overwrite: 0, skip: 0 }
  for (const row of rows) counts[row.action]++
  return { rows, counts, fingerprint: fingerprintOf(rows) }
}

/** Everything a write depends on, hashed. */
export function fingerprintOf(rows: PlanRow[]): string {
  const parts = rows
    .map((row) =>
      [
        row.key,
        row.base_price_id,
        row.base_amount,
        row.current?.id,
        row.current?.amount,
        row.new_amount,
        row.action,
        row.rate?.rate,
        row.rate?.margin,
        row.rate?.source?.table,
      ].join("~")
    )
    .sort()
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 32)
}
