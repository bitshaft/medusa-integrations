import { convertAmount, dec, plain, type ResolvedRate } from "./money"
import type { PlanRegion } from "./fill/plan"
import { taxCountryFor } from "./fill/plan"
import type { RateProblem } from "./rates"
import type { CurrencyRule } from "./settings"

/**
 * Suggestions for Medusa's own price editor: the admin types one price of a
 * variant, in any column, and gets every other column of that row computed
 * from it under the same rules as a fill (rate, margin, rounding, VAT).
 *
 * A column ("slot") is a store currency (`eur`) or a region (`reg_…`), as in
 * Medusa's grid. The typed price is first taken back to the base currency
 * (the inverse of its own rule, without rounding) and then converted like a
 * base price. A column in the same currency as the typed one keeps the
 * amount (only VAT may differ), with no rounding.
 */

export type SuggestCurrency = { code: string; decimals: number }

export type SuggestContext = {
  base: SuggestCurrency
  currencies: SuggestCurrency[]
  regions: PlanRegion[]
  baseTaxCountry: string | null
  taxInclusive: { currency: Record<string, boolean>; region: Record<string, boolean> }
  taxRates: Record<string, string | null>
  /** The rule of every store currency other than the base one. */
  rules: Record<string, CurrencyRule>
  /** The resolved rate of every store currency other than the base one. */
  rates: Record<string, { ok: true; rate: ResolvedRate } | { ok: false; reason: RateProblem }>
}

export type SuggestRequestRow = {
  /** The caller's row key, returned as it is. */
  key: string
  /** The column the price was typed in. */
  slot: string
  amount: string
}

export type SuggestWarning = "tax_differs" | "rounding_fallback" | "stale_rate"
export type SuggestProblem = RateProblem | "tax_rate_missing" | "disabled"

export type Suggestion =
  | { slot: string; currency: string; region_id: string | null; ok: true; amount: string; warnings: SuggestWarning[] }
  | { slot: string; currency: string; region_id: string | null; ok: false; reason: SuggestProblem }

export type SuggestRow = {
  key: string
  source: { slot: string; currency: string; region_id: string | null; amount: string }
  /** Why nothing could be computed from this row's price. */
  error: "unknown_slot" | "invalid_amount" | RateProblem | null
  suggestions: Suggestion[]
}

const IDENTITY = { rate: "1", margin: "0" }

export function suggestPrices(context: SuggestContext, rows: SuggestRequestRow[]): SuggestRow[] {
  const base = context.base.code
  const regionsById = new Map(context.regions.map((region) => [region.id, region]))
  const decimalsOf = new Map(context.currencies.map((currency) => [currency.code, currency.decimals]))
  const firstRegion = (currency: string) =>
    context.regions.filter((region) => region.currency === currency).sort((a, b) => a.name.localeCompare(b.name))[0]
  const chosenCountry = (currency: string) =>
    currency === base ? context.baseTaxCountry : (context.rules[currency]?.taxCountry ?? null)
  const taxSide = (currency: string, regionId: string | null) => {
    const region = regionId ? regionsById.get(regionId) : firstRegion(currency)
    const country = taxCountryFor(chosenCountry(currency), region, Boolean(regionId))
    const inclusive =
      regionId && regionId in context.taxInclusive.region
        ? context.taxInclusive.region[regionId]
        : (context.taxInclusive.currency[currency] ?? false)
    return { inclusive, rate: country ? (context.taxRates[country] ?? null) : null }
  }
  const slotOf = (slot: string): { currency: string; region_id: string | null } | null => {
    const region = regionsById.get(slot)
    if (region) return { currency: region.currency, region_id: region.id }
    const code = slot.toLowerCase()
    return decimalsOf.has(code) ? { currency: code, region_id: null } : null
  }
  const slots = [
    ...context.currencies.map((currency) => ({ slot: currency.code, currency: currency.code, region_id: null })),
    ...context.regions
      .filter((region) => decimalsOf.has(region.currency))
      .map((region) => ({ slot: region.id, currency: region.currency, region_id: region.id as string | null })),
  ]

  return rows.map((row): SuggestRow => {
    const where = slotOf(row.slot)
    const source = { slot: row.slot, currency: where?.currency ?? "", region_id: where?.region_id ?? null, amount: row.amount }
    const fail = (error: SuggestRow["error"]): SuggestRow => ({ key: row.key, source, error, suggestions: [] })
    if (!where) return fail("unknown_slot")
    if (!/^\d+(\.\d+)?$/.test(row.amount) || !dec(row.amount).gt(0)) return fail("invalid_amount")

    // The typed price in base units (still with the source's VAT, if any).
    let sourceRate = IDENTITY
    let sourceStale = false
    if (where.currency !== base) {
      const resolved = context.rates[where.currency]
      if (!resolved) return fail("rate_missing")
      if (!resolved.ok) return fail(resolved.reason)
      sourceRate = resolved.rate
      sourceStale = Boolean(resolved.rate.source?.stale)
    }
    const inBase = plain(
      dec(row.amount)
        .times(dec(sourceRate.rate))
        .div(dec(1).plus(dec(sourceRate.margin).div(100)))
    )
    const sourceTax = taxSide(where.currency, where.region_id)

    const suggestions = slots
      .filter((target) => target.slot !== row.slot)
      .map((target): Suggestion => {
        const head = { slot: target.slot, currency: target.currency, region_id: target.region_id }
        const decimals = decimalsOf.get(target.currency) ?? 2
        const rule = context.rules[target.currency]
        if (target.currency !== base && rule && !rule.enabled) return { ...head, ok: false, reason: "disabled" }

        let amount = inBase
        let rate = IDENTITY
        let rounding: CurrencyRule["rounding"] = "none"
        let stale = sourceStale
        if (target.currency === where.currency) {
          amount = row.amount
          stale = false
        } else if (target.currency !== base) {
          const resolved = context.rates[target.currency]
          if (!resolved) return { ...head, ok: false, reason: "rate_missing" }
          if (!resolved.ok) return { ...head, ok: false, reason: resolved.reason }
          rate = resolved.rate
          rounding = rule?.rounding ?? "none"
          stale = stale || Boolean(resolved.rate.source?.stale)
        }
        const conversion = convertAmount({
          amount,
          rate,
          decimals,
          rounding,
          tax: (target.currency === base ? context.rules[where.currency]?.tax : rule?.tax) ?? "gross",
          base: sourceTax,
          target: taxSide(target.currency, target.region_id),
        })
        if (!conversion.ok) return { ...head, ok: false, reason: conversion.reason }
        return {
          ...head,
          ok: true,
          amount: conversion.amount,
          warnings: [...conversion.warnings, ...(stale ? (["stale_rate"] as const) : [])],
        }
      })
    return { key: row.key, source, error: null, suggestions }
  })
}
