import type { OmnibusException } from "./settings"
import { DAY_MS } from "./format"
import type { DiscountKind, OmnibusRule } from "./types"

/** One stored price observation of a variant in a region (amounts with tax, as the customer sees them). */
export type PricePoint = {
  at: Date
  /** The price the customer pays now. */
  amount: number
  /** The price without any discount. */
  regular: number
  discounted: boolean
  kind?: DiscountKind | null
  ref?: string | null
}

/**
 * Where the history of a variant starts. `known: true`: the variant was
 * created after the plugin started recording, so its history is complete
 * from `at` (it has been on sale only that long). `known: false`: the first
 * record is the snapshot taken when the plugin was installed; nothing before
 * it is known.
 */
export type HistoryStart = { at: Date; known: boolean }

export type LowestPriceResult = {
  discounted: boolean
  amount: number | null
  regular: number | null
  kind: DiscountKind | null
  ref: string | null
  /** When the current discount began (the reference point for the period). */
  discount_started_at: Date | null
  /** Start of the period searched for the lowest price. */
  period_start: Date | null
  /** Lowest price in the period before the discount; null when nothing is known. */
  lowest: number | null
  /** The history does not reach back over the whole period: the lowest price may be wrong. */
  history_incomplete: boolean
  /** On sale for less than the period: the lowest price is taken since `sold_since`. */
  sold_since: Date | null
  /** The product or category is exempt from showing the lowest price. */
  exempt: boolean
}

const EMPTY: LowestPriceResult = {
  discounted: false,
  amount: null,
  regular: null,
  kind: null,
  ref: null,
  discount_started_at: null,
  period_start: null,
  lowest: null,
  history_incomplete: false,
  sold_since: null,
  exempt: false,
}

/**
 * Index of the record where the current discount began.
 *
 * - default: every further price cut during a sale counts as a new
 *   discount, so the reference point moves to the latest cut;
 * - `gradual`: a run of cuts without going back to the regular price is
 *   one discount, so the reference point stays at its first cut.
 */
export function discountStartIndex(points: PricePoint[], rule: OmnibusRule | null): number {
  const last = points.length - 1
  if (last < 0 || !points[last].discounted) return -1
  let index = last
  while (index > 0 && points[index - 1].discounted) {
    const cut = points[index].amount < points[index - 1].amount
    if (rule !== "gradual" && cut) return index
    index--
  }
  return index
}

/**
 * The lowest price in `periodDays` before the current discount began.
 *
 * The price in effect when the period starts counts too (the last record
 * before it). If the variant has been on sale for less than the period, the
 * lowest price since it went on sale is used. If the history starts with the
 * installation snapshot and does not cover the whole period, the result is
 * marked `history_incomplete`.
 */
export function lowestPriceBeforeDiscount(
  input: PricePoint[],
  options: { periodDays: number; start: HistoryStart; rule?: OmnibusRule | null }
): LowestPriceResult {
  const points = [...input].sort((a, b) => a.at.getTime() - b.at.getTime())
  const current = points[points.length - 1]
  if (!current) return { ...EMPTY }
  const base = {
    ...EMPTY,
    amount: current.amount,
    regular: current.regular,
  }
  if (options.rule === "exempt") return { ...base, exempt: true }
  if (!current.discounted) return base

  const startIndex = discountStartIndex(points, options.rule ?? null)
  const startedAt = points[startIndex].at
  const periodStart = new Date(startedAt.getTime() - options.periodDays * DAY_MS)
  const result: LowestPriceResult = {
    ...base,
    discounted: true,
    kind: current.kind ?? null,
    ref: current.ref ?? null,
    discount_started_at: startedAt,
    period_start: periodStart,
  }

  const before = points.slice(0, startIndex)
  // The record in effect when the period starts, and every change after it.
  let from = -1
  for (let i = 0; i < before.length; i++) if (before[i].at.getTime() <= periodStart.getTime()) from = i
  const inPeriod = from >= 0 ? before.slice(from) : before
  const lowest = inPeriod.length ? Math.min(...inPeriod.map((p) => p.amount)) : null

  const historyBegins = options.start.at.getTime()
  const coversPeriod = from >= 0 || historyBegins <= periodStart.getTime()
  if (coversPeriod) return { ...result, lowest }
  if (options.start.known) {
    // On sale for less than the period: lowest since the start of sales.
    return { ...result, lowest, sold_since: options.start.at }
  }
  return { ...result, lowest, history_incomplete: true }
}

/** The rule for a product: a product exception wins over a category one; `exempt` wins over `gradual`. */
export function ruleFor(
  exceptions: OmnibusException[],
  productId: string,
  categoryIds: string[] = []
): OmnibusRule | null {
  const own = exceptions.filter((e) => e.target === "product" && e.id === productId)
  const pick = (list: OmnibusException[]) =>
    list.some((e) => e.rule === "exempt") ? "exempt" : list.length ? "gradual" : null
  return pick(own) ?? pick(exceptions.filter((e) => e.target === "category" && categoryIds.includes(e.id)))
}

/** Key of a price series: one per variant, region and currency. */
export const seriesKey = (p: { variant_id: string; region_id: string; currency_code: string }) =>
  `${p.variant_id}|${p.region_id}|${p.currency_code}`

/** Whether a new observation differs from the last stored one (only changes are recorded). */
export function priceChanged(last: PricePoint | null | undefined, next: Omit<PricePoint, "at">): boolean {
  if (!last) return true
  return (
    last.amount !== next.amount ||
    last.regular !== next.regular ||
    last.discounted !== next.discounted ||
    (last.kind ?? null) !== (next.kind ?? null) ||
    (last.ref ?? null) !== (next.ref ?? null)
  )
}

/** The price a customer sees, with tax: `inclusive` amounts are already gross. */
export function withTax(amount: number, ratePercent: number, inclusive: boolean): number {
  const gross = inclusive ? amount : amount * (1 + ratePercent / 100)
  return Math.round(gross * 100) / 100
}
