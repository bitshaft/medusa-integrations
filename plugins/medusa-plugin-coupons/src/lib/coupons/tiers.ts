import type { Tier } from "./types"

export type TierError =
  | "too_few"
  | "min_not_positive"
  | "value_not_positive"
  | "percent_over_100"
  | "min_not_increasing"
  | "value_not_increasing"

/**
 * Checks the levels of a tiered coupon, in any input order: at least two,
 * distinct positive minimums, and a bigger discount for each higher level
 * (otherwise buying more would cost the customer their discount).
 */
export function validateTiers(tiers: Tier[], kind: "percentage" | "fixed"): TierError[] {
  const errors = new Set<TierError>()
  if (tiers.length < 2) errors.add("too_few")
  for (const tier of tiers) {
    if (!(tier.min > 0)) errors.add("min_not_positive")
    if (!(tier.value > 0)) errors.add("value_not_positive")
    if (kind === "percentage" && tier.value > 100) errors.add("percent_over_100")
  }
  const sorted = sortedTiers(tiers)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min === sorted[i - 1].min) errors.add("min_not_increasing")
    else if (sorted[i].value <= sorted[i - 1].value) errors.add("value_not_increasing")
  }
  return [...errors]
}

/** The level a basket of `amount` falls into: the highest tier it reaches, or null. */
export function pickTier(tiers: Tier[], amount: number): Tier | null {
  const sorted = [...tiers].sort((a, b) => a.min - b.min)
  let picked: Tier | null = null
  for (const tier of sorted) {
    if (amount >= tier.min) picked = tier
  }
  return picked
}

/**
 * The basket band a tier covers: from its minimum up to the next tier's
 * minimum. Core promotions have no tiers, so each level becomes its own
 * promotion limited to its band; then a basket matches exactly one level,
 * and the customer gets the highest one they reach, never several at once.
 */
export function tierBand(tiers: Tier[], index: number): { gte: number; lt: number | null } {
  const sorted = [...tiers].sort((a, b) => a.min - b.min)
  const current = sorted[index]
  const next = sorted[index + 1]
  return { gte: current.min, lt: next ? next.min : null }
}

/** Sorted copy, so index-based lookups agree with `tierBand`. */
export function sortedTiers(tiers: Tier[]): Tier[] {
  return [...tiers].sort((a, b) => a.min - b.min)
}
