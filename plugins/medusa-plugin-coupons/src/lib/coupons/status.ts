/** What the list shows next to a code. */
export type CouponStatus = "active" | "scheduled" | "paused" | "ended"

export const COUPON_FILTERS = ["all", "active", "scheduled", "paused", "ended", "expiring", "automatic"] as const
export type CouponFilter = (typeof COUPON_FILTERS)[number]

/** "Ending soon" means ending within this many days. */
export const EXPIRING_DAYS = 7

export type StatusInput = {
  /** The Promotion Module status. */
  promotion_status: "draft" | "active" | "inactive"
  starts_at: Date | string | null
  ends_at: Date | string | null
  limit: number | null
  used: number
  automatic: boolean
}

const time = (value: Date | string) => (value instanceof Date ? value : new Date(value)).getTime()

/**
 * Ended wins over paused: a paused coupon past its end date or out of uses
 * will not come back by resuming it, so the list should say so.
 */
export function couponStatus(input: StatusInput, now: Date): CouponStatus {
  if (input.ends_at && time(input.ends_at) <= now.getTime()) return "ended"
  if (input.limit != null && input.used >= input.limit) return "ended"
  if (input.promotion_status !== "active") return "paused"
  if (input.starts_at && time(input.starts_at) > now.getTime()) return "scheduled"
  return "active"
}

export function isExpiring(input: StatusInput, now: Date): boolean {
  if (couponStatus(input, now) !== "active" || !input.ends_at) return false
  return time(input.ends_at) - now.getTime() <= EXPIRING_DAYS * 24 * 60 * 60 * 1000
}

export function matchesFilter(input: StatusInput, filter: CouponFilter, now: Date): boolean {
  switch (filter) {
    case "all":
      return true
    case "expiring":
      return isExpiring(input, now)
    case "automatic":
      return input.automatic
    default:
      return couponStatus(input, now) === filter
  }
}

/** A list row whose status is already computed. */
export type ClassifiedCoupon = { status: CouponStatus; expiring: boolean; automatic: boolean }

export function rowMatchesFilter(row: ClassifiedCoupon, filter: CouponFilter): boolean {
  switch (filter) {
    case "all":
      return true
    case "expiring":
      return row.expiring
    case "automatic":
      return row.automatic
    default:
      return row.status === filter
  }
}

/** Counters for the filter chips, from rows already classified. */
export function countRows(rows: ClassifiedCoupon[]): Record<CouponFilter, number> {
  return Object.fromEntries(
    COUPON_FILTERS.map((filter) => [filter, rows.filter((row) => rowMatchesFilter(row, filter)).length])
  ) as Record<CouponFilter, number>
}

/** Counters for the filter chips. */
export function countByFilter(inputs: StatusInput[], now: Date): Record<CouponFilter, number> {
  const counts = Object.fromEntries(COUPON_FILTERS.map((filter) => [filter, 0])) as Record<CouponFilter, number>
  for (const input of inputs) {
    for (const filter of COUPON_FILTERS) {
      if (matchesFilter(input, filter, now)) counts[filter]++
    }
  }
  return counts
}
