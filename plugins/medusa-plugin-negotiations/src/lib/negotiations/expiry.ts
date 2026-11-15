import { ACTIVE_STATUSES, type Status } from "./types"

export const DAY_MS = 86_400_000
/** "Expires within two days" on the dashboard. */
export const SOON_MS = 2 * DAY_MS
/** The latest deadline a counter-offer may get. */
export const MAX_OFFER_DAYS = 365

const addDays = (from: Date, days: number) => new Date(from.getTime() + days * DAY_MS)

/** When a thread expires for lack of moves; `null` when expiry is off (`expiryDays: 0`). */
export function threadExpiresAt(lastActivityAt: Date, expiryDays: number): Date | null {
  return expiryDays > 0 ? addDays(lastActivityAt, expiryDays) : null
}

/** Default deadline of a counter-offer: the thread's usual term, counted from now. */
export function defaultOfferDeadline(now: Date, expiryDays: number): Date | null {
  return expiryDays > 0 ? addDays(now, expiryDays) : null
}

/** Until when an accepted price can be used. */
export function acceptedUntil(now: Date, acceptedOfferDays: number): Date {
  return addDays(now, acceptedOfferDays)
}

/** A deadline chosen by the team must be in the future and at most a year away. */
export function checkOfferDeadline(value: Date, now: Date): "past" | "too_far" | null {
  if (value.getTime() <= now.getTime()) return "past"
  if (value.getTime() > addDays(now, MAX_OFFER_DAYS).getTime()) return "too_far"
  return null
}

export type ExpiryInput = {
  status: Status
  is_demo?: boolean
  last_activity_at: Date
  offer_expires_at: Date | null
}

/** Whether the thread itself expires now (no moves for `expiryDays`). Demo threads never expire. */
export function isStale(thread: ExpiryInput, now: Date, expiryDays: number): boolean {
  if (thread.is_demo || !ACTIVE_STATUSES.includes(thread.status)) return false
  const at = threadExpiresAt(thread.last_activity_at, expiryDays)
  return at !== null && at.getTime() <= now.getTime()
}

/** Whether the pending counter-offer passed its own deadline. */
export function offerLapsed(thread: ExpiryInput, now: Date): boolean {
  if (thread.is_demo || thread.status !== "countered" || !thread.offer_expires_at) return false
  return thread.offer_expires_at.getTime() <= now.getTime()
}

/** The nearest deadline of an active thread: its own expiry or the counter-offer's. */
export function nextDeadline(thread: ExpiryInput, expiryDays: number): Date | null {
  if (!ACTIVE_STATUSES.includes(thread.status)) return null
  const own = threadExpiresAt(thread.last_activity_at, expiryDays)
  const offer = thread.status === "countered" ? thread.offer_expires_at : null
  const dates = [own, offer].filter((d): d is Date => d !== null)
  if (!dates.length) return null
  return new Date(Math.min(...dates.map((d) => d.getTime())))
}

/** Counted on the dashboard as "expires within two days". */
export function expiresSoon(thread: ExpiryInput, now: Date, expiryDays: number): boolean {
  if (thread.is_demo) return false
  const at = nextDeadline(thread, expiryDays)
  return at !== null && at.getTime() > now.getTime() && at.getTime() - now.getTime() <= SOON_MS
}
