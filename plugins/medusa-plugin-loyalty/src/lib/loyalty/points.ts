import type { LoyaltySettings } from "./settings"
import type { Tier } from "./types"

/** Floating point noise below this is ignored before rounding down (0.1 + 0.2 must not lose a point). */
const EPSILON = 1e-9

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Points for a base amount: `points` per `per_amount`, times the tier
 * multiplier, always rounded down to a whole point.
 *
 * `earnedPoints(255, { points: 1, per_amount: 1 }, 1.25)` → 318
 */
export function earnedPoints(
  base: number,
  earn: Pick<LoyaltySettings["earn"], "points" | "per_amount">,
  multiplier = 1
): number {
  if (!(base > 0) || !(earn.per_amount > 0) || !(earn.points > 0) || !(multiplier > 0)) return 0
  return Math.floor((base / earn.per_amount) * earn.points * multiplier + EPSILON)
}

/**
 * How much 1 unit of `currency` is worth in the program currency: 1 for
 * the program currency itself, the admin's rate for another one, `null`
 * when there is none (such orders earn nothing).
 */
export function currencyFactor(
  currency: string | null | undefined,
  programCurrency: string,
  rates: Record<string, number>
): number | null {
  const code = (currency ?? programCurrency).toLowerCase()
  if (code === programCurrency.toLowerCase()) return 1
  const rate = rates[code]
  return rate && rate > 0 ? rate : null
}

/** An order's base converted to the program currency, line by line (so returns and tier spend stay right). */
export function convertBase(
  base: { total: number; lines: BaseLine[] },
  factor: number
): { total: number; lines: BaseLine[] } {
  if (factor === 1) return base
  const lines = base.lines.map((line) => ({ ...line, base: round2(line.base * factor) }))
  return { total: round2(lines.reduce((sum, line) => sum + line.base, 0)), lines }
}

/** An order line as the earning rules need it. */
export type OrderLine = {
  id: string
  quantity: number
  /** Line total after discounts, with tax. */
  total: number
  /** Tax of the line after discounts. */
  tax_total: number
  /** Loyalty gifts earn nothing. */
  is_reward: boolean
}

export type BaseLine = { id: string; quantity: number; base: number }

/**
 * The earning base of an order: every line except gifts, after discounts,
 * gross or net, without shipping. Kept per line so returns can take back
 * exactly the share of the returned units.
 */
export function orderBase(lines: OrderLine[], mode: "gross" | "net"): { total: number; lines: BaseLine[] } {
  const result: BaseLine[] = []
  for (const line of lines) {
    if (line.is_reward || !(line.quantity > 0)) continue
    const base = Math.max(0, mode === "gross" ? line.total : line.total - line.tax_total)
    result.push({ id: line.id, quantity: line.quantity, base: round2(base) })
  }
  return { total: round2(result.reduce((sum, line) => sum + line.base, 0)), lines: result }
}

/**
 * How many of the points earned on an order should be taken back once
 * `returned` units per line have come back. The units kept still earn,
 * rounded down; everything else is taken back. A full return takes back
 * everything. The value of the units counts, not the money refunded.
 */
export function returnTarget(earned: number, lines: BaseLine[], returned: Record<string, number>): number {
  const total = lines.reduce((sum, line) => sum + line.base, 0)
  if (!(earned > 0) || !(total > 0)) return 0
  let kept = 0
  for (const line of lines) {
    const back = Math.min(line.quantity, Math.max(0, returned[line.id] ?? 0))
    kept += line.base * ((line.quantity - back) / line.quantity)
  }
  const keptPoints = Math.floor((earned * kept) / total + EPSILON)
  return Math.max(0, earned - keptPoints)
}

/** Spend counted for tiers: the base of an order, minus the share of returned units. */
export function keptBase(lines: BaseLine[], returned: Record<string, number>): number {
  return round2(
    lines.reduce((sum, line) => {
      const back = Math.min(line.quantity, Math.max(0, returned[line.id] ?? 0))
      return sum + line.base * ((line.quantity - back) / line.quantity)
    }, 0)
  )
}

/** The highest tier the spend reaches, or null. */
export function tierFor(spend: number, tiers: Tier[]): Tier | null {
  let found: Tier | null = null
  for (const tier of [...tiers].sort((a, b) => a.threshold - b.threshold)) {
    if (spend + EPSILON >= tier.threshold) found = tier
  }
  return found
}

/** The next tier above the current spend, and how much is missing. */
export function nextTier(spend: number, tiers: Tier[]): { tier: Tier; remaining: number } | null {
  const next = [...tiers].sort((a, b) => a.threshold - b.threshold).find((tier) => spend + EPSILON < tier.threshold)
  return next ? { tier: next, remaining: round2(next.threshold - spend) } : null
}

/** `months` calendar months after `from`, clamped to the last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime())
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

/** When points expire: `months` after the last order or redemption. Null when expiry is off or nothing happened yet. */
export function expiresAt(lastActivity: Date | null, expiry: LoyaltySettings["expiry"]): Date | null {
  if (!expiry.enabled || !lastActivity) return null
  return addMonths(lastActivity, expiry.months)
}

/** Whether a positive balance has expired at `now`. */
export function isExpired(lastActivity: Date | null, expiry: LoyaltySettings["expiry"], now: Date): boolean {
  const at = expiresAt(lastActivity, expiry)
  return !!at && at.getTime() <= now.getTime()
}

/** Whether the "points expiring" reminder is due at `now` (and not yet expired). */
export function reminderDue(lastActivity: Date | null, expiry: LoyaltySettings["expiry"], now: Date): boolean {
  const at = expiresAt(lastActivity, expiry)
  if (!at || expiry.reminder_days <= 0) return false
  const remindFrom = at.getTime() - expiry.reminder_days * 86_400_000
  return now.getTime() >= remindFrom && now.getTime() < at.getTime()
}

/**
 * Value of one point in money, estimated from the cheapest amount reward
 * (its value divided by its cost). Null when there is no amount reward.
 */
export function pointValue(
  rewards: Array<{ kind: string; value: number | null; cost: number; active: boolean }>
): number | null {
  const amounts = rewards.filter((r) => r.kind === "fixed" && r.active && (r.value ?? 0) > 0 && r.cost > 0)
  if (!amounts.length) return null
  const cheapest = amounts.reduce((min, r) => (r.cost < min.cost ? r : min))
  return cheapest.value! / cheapest.cost
}
