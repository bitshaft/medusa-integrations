/** What a ledger entry records. The sign of `points` says which way it went. */
export const ENTRY_TYPES = ["order", "action", "redemption", "return", "expiry", "adjustment", "tier_bonus"] as const
export type EntryType = (typeof ENTRY_TYPES)[number]

/** Finer cause of an entry, for history and filters. */
export const ENTRY_REASONS = [
  "earn", // points for a paid order
  "cancel", // order canceled: everything earned for it taken back
  "return", // items returned: their share taken back
  "signup",
  "first_order",
  "birthday",
  "newsletter",
  "redeem", // points spent on a reward
  "redeem_returned", // points given back: gift removed, code expired unused, failed redemption
  "expired",
  "manual",
  "tier_bonus",
] as const
export type EntryReason = (typeof ENTRY_REASONS)[number]

export const ACTOR_TYPES = ["system", "admin", "customer"] as const
export type ActorType = (typeof ACTOR_TYPES)[number]

export const REWARD_KINDS = ["fixed", "percentage", "free_shipping", "gift"] as const
export type RewardKind = (typeof REWARD_KINDS)[number]

export const REDEMPTION_STATUSES = [
  "issued", // code created, not used yet
  "used", // code used in an order
  "expired", // code expired unused
  "in_cart", // gift added to a cart
  "ordered", // gift ordered
  "released", // gift removed from the cart or the cart abandoned: points returned
] as const
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number]

export const LOCALES = ["pl", "en"] as const
export type Locale = (typeof LOCALES)[number]

export type Tier = {
  id: string
  name: string
  /** Spend in the window (major units) from which the tier applies. */
  threshold: number
  multiplier: number
  /** Points given once the first time a customer reaches the tier. */
  bonus_points: number
}
