/** What a thread is about: one product variant, or the whole cart. */
export const THREAD_KINDS = ["product", "cart"] as const
export type ThreadKind = (typeof THREAD_KINDS)[number]

export const STATUSES = ["open", "countered", "accepted", "rejected", "expired", "withdrawn"] as const
export type Status = (typeof STATUSES)[number]

/** Statuses in which the conversation goes on. */
export const ACTIVE_STATUSES: readonly Status[] = ["open", "countered"]

/** Whose move it is. `null` once the thread is closed. */
export type Turn = "team" | "customer" | null

export const AUTHORS = ["customer", "team", "system"] as const
export type Author = (typeof AUTHORS)[number]

export const MESSAGE_TYPES = [
  "message",
  "target_price",
  "counter_offer",
  "acceptance",
  "rejection",
  "internal_note",
  "expiry",
  "offer_expired",
  "withdrawal",
  "added_to_cart",
  "draft_order_created",
] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]

/** How a counter-offer on a whole cart is priced. */
export const OFFER_MODES = ["unit", "total", "lines"] as const
export type OfferMode = (typeof OFFER_MODES)[number]

/** Which counter-offer modes the team may use on cart threads (an admin setting). */
export const CART_COUNTER_MODES = ["total", "lines", "both"] as const
export type CartCounterModes = (typeof CART_COUNTER_MODES)[number]

/**
 * One line of a thread, frozen when the customer sent it. Amounts are
 * integers in the currency's smallest unit (grosze).
 */
export type ThreadLine = {
  variant_id: string
  product_id: string | null
  product_title: string
  variant_title: string | null
  sku: string | null
  thumbnail: string | null
  quantity: number
  /** Catalog price for one unit at the time the thread was sent. */
  catalog_unit_price: number
}

/** A priced line of an offer: the unit price the line would be sold at. */
export type OfferLine = { variant_id: string; quantity: number; unit_price: number }

/**
 * A price on the table. `total` is always the sum of `lines`
 * (unit price × quantity), so what is shown is what is sold.
 */
export type Offer = {
  mode: OfferMode
  lines: OfferLine[]
  total: number
  /** For `total` mode: the amount the team typed, before rounding to whole grosze per unit. */
  requested_total?: number | null
}

export type CustomerSnapshot = {
  email: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
}

export type Actor = { type: "customer" | "user" | "system"; id: string | null }
