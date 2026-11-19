import { MathBN } from "@medusajs/framework/utils"

import type { RateMode, Rounding, TaxMode } from "./settings"

/**
 * Amount arithmetic. Everything is decimal (Medusa's `MathBN`, backed by
 * bignumber.js): no floating point anywhere between the base price and the
 * new one. Amounts travel as strings in major units ("255.00"), the way
 * Medusa keeps `raw_amount`.
 */

type Decimal = ReturnType<typeof MathBN.convert>

const ROUND_HALF_UP = 4
const ROUND_FLOOR = 3

/** Decimal places kept for a cross rate (the rate shown and stored is the one used). */
export const RATE_DECIMALS = 8

export const dec = (value: string | number | Decimal): Decimal => MathBN.convert(value)

/** A canonical decimal string without trailing zeros ("4.4165", "1"). */
export const plain = (value: Decimal): string => value.toFixed()

/** A rate written with up to `RATE_DECIMALS` places, rounded half up. */
export const rateString = (value: Decimal): string => plain(value.decimalPlaces(RATE_DECIMALS, ROUND_HALF_UP))

/** "4" → "4.00" for a currency with 2 decimals. */
export const fixed = (value: string | Decimal, decimals: number): string => dec(value).toFixed(decimals, ROUND_HALF_UP)

export const sameAmount = (a: string | number, b: string | number): boolean => MathBN.eq(dec(a), dec(b))

/**
 * Rounds a converted price. `none` rounds to the currency's minor unit;
 * the others pick the nearest allowed price (ties go up), never zero:
 * `whole` 24, `x99` 23.99 / 24.99, `x49_99` 24.49 / 24.99, `five` 25,
 * `ten` 20 / 30. Price endings need a currency with minor units; without
 * them (HUF, JPY) `x99` and `x49_99` round to whole units (`fallback`).
 */
export function roundPrice(
  value: string | Decimal,
  decimals: number,
  rounding: Rounding
): { amount: string; fallback: boolean } {
  const amount = dec(value)
  const ending = rounding === "x99" || rounding === "x49_99"
  if (ending && decimals === 0) {
    return { amount: roundPrice(amount, 0, "whole").amount, fallback: true }
  }
  switch (rounding) {
    case "none": {
      const rounded = amount.decimalPlaces(decimals, ROUND_HALF_UP)
      const minimum = dec(1).shiftedBy(-decimals)
      return { amount: fixed(rounded.gt(0) ? rounded : minimum, decimals), fallback: false }
    }
    case "whole":
      return { amount: fixed(atLeast(amount.integerValue(ROUND_HALF_UP), dec(1)), decimals), fallback: false }
    case "five":
    case "ten": {
      const step = dec(rounding === "five" ? 5 : 10)
      const rounded = amount.div(step).integerValue(ROUND_HALF_UP).times(step)
      return { amount: fixed(atLeast(rounded, step), decimals), fallback: false }
    }
    case "x99":
    case "x49_99": {
      const floor = amount.integerValue(ROUND_FLOOR)
      const endings = rounding === "x99" ? ["-0.01", "0.99"] : ["-0.01", "0.49", "0.99"]
      const candidates = endings.map((ending) => floor.plus(ending)).filter((candidate) => candidate.gt(0))
      let best = candidates[0]
      for (const candidate of candidates.slice(1)) {
        const distance = candidate.minus(amount).abs()
        const bestDistance = best.minus(amount).abs()
        // Ties go up.
        if (distance.lt(bestDistance) || distance.eq(bestDistance)) best = candidate
      }
      return { amount: fixed(best, decimals), fallback: false }
    }
  }
}

const atLeast = (value: Decimal, minimum: Decimal): Decimal => (value.lt(minimum) ? minimum : value)

/** One currency's rate as applied: what one unit of the target currency is worth in the base currency. */
export type ResolvedRate = {
  /** Target currency, lowercase. */
  currency: string
  mode: RateMode
  /** 1 target unit = `rate` base units, before the margin. */
  rate: string
  /** Percent added to the converted price ("0" unless `api_margin`). */
  margin: string
  /** Base units per target unit after the margin: `rate / (1 + margin / 100)`. */
  effective: string
  /** The published table the rate comes from; null for a fixed rate. */
  source: RateSource | null
}

export type RateSource = {
  provider: string
  /** The table's number, e.g. "225/A/NBP/2026". */
  table: string
  /** The day the table applies to, `YYYY-MM-DD`. */
  date: string
  /** The rate source did not answer and this is the last saved table. */
  stale: boolean
}

/** The effective rate for a rate and a margin. */
export function effectiveRate(rate: string, margin: string): string {
  return rateString(dec(rate).div(dec(1).plus(dec(margin).div(100))))
}

/** Tax on one side of a conversion: whether its prices include tax, and the VAT rate in percent. */
export type TaxSide = { inclusive: boolean; rate: string | null }

/**
 * What happened to tax: `gross` converted as it is, `net` taken off and
 * added again, `strip` taken off (base gross, target net), `add` added (base
 * net, target gross), `none` both net.
 */
export type TaxStep = "gross" | "net" | "strip" | "add" | "none"

export type Conversion =
  | {
      ok: true
      amount: string
      /** Before rounding, at full precision. */
      exact: string
      tax: TaxStep
      warnings: Array<"tax_differs" | "rounding_fallback">
    }
  | { ok: false; reason: "tax_rate_missing" }

/**
 * Converts one base price into the target currency:
 * tax off (when needed) → `amount / rate × (1 + margin)` → tax on (when
 * needed) → rounding. Gross-to-gross with different VAT rates is converted
 * as it is in `gross` mode, with a `tax_differs` warning.
 */
export function convertAmount(input: {
  amount: string
  rate: Pick<ResolvedRate, "rate" | "margin">
  decimals: number
  rounding: Rounding
  tax: TaxMode
  base: TaxSide
  target: TaxSide
}): Conversion {
  const { base, target } = input
  let step: TaxStep
  if (base.inclusive && target.inclusive) step = input.tax === "net" ? "net" : "gross"
  else if (base.inclusive) step = "strip"
  else if (target.inclusive) step = "add"
  else step = "none"

  const needsBase = step === "net" || step === "strip"
  const needsTarget = step === "net" || step === "add"
  if ((needsBase && base.rate === null) || (needsTarget && target.rate === null)) {
    return { ok: false, reason: "tax_rate_missing" }
  }

  let value = dec(input.amount)
  if (needsBase) value = value.div(dec(1).plus(dec(base.rate!).div(100)))
  value = value.div(dec(input.rate.rate)).times(dec(1).plus(dec(input.rate.margin).div(100)))
  if (needsTarget) value = value.times(dec(1).plus(dec(target.rate!).div(100)))

  const rounded = roundPrice(value, input.decimals, input.rounding)
  const warnings: Array<"tax_differs" | "rounding_fallback"> = []
  if (step === "gross" && base.rate !== null && target.rate !== null && !MathBN.eq(dec(base.rate), dec(target.rate))) {
    warnings.push("tax_differs")
  }
  if (rounded.fallback) warnings.push("rounding_fallback")
  return { ok: true, amount: rounded.amount, exact: plain(value.decimalPlaces(12, ROUND_HALF_UP)), tax: step, warnings }
}
