/** Languages of the admin and of customer messages. Polish is the default. */
export const LOCALES = ["pl", "en"] as const
export type Locale = (typeof LOCALES)[number]

/* GPSR ---------------------------------------------------------------------- */

/** Contact details of a manufacturer or of the responsible person in the EU. */
export type Party = {
  name: string | null
  trade_name: string | null
  postal_address: string | null
  electronic_address: string | null
}

export const PARTY_FIELDS = ["name", "trade_name", "postal_address", "electronic_address"] as const
export type PartyField = (typeof PARTY_FIELDS)[number]

/** Warnings and safety information: Markdown text per language. */
export type Warnings = Partial<Record<Locale, string>>

/** Where a GPSR field is missing; `gpsr.missing.<code>` in the admin translations. */
export const GPSR_GAPS = [
  "manufacturer.name",
  "manufacturer.trade_name",
  "manufacturer.postal_address",
  "manufacturer.electronic_address",
  "responsible.name",
  "responsible.trade_name",
  "responsible.postal_address",
  "responsible.electronic_address",
  "identification.type",
  "identification.model",
  "identification.batch",
  "label_image",
  "warnings",
] as const
export type GpsrGap = `${(typeof GPSR_GAPS)[number]}` | `warnings.${Locale}`

/* GDPR ---------------------------------------------------------------------- */

export const CONSENT_PLACEMENTS = ["registration", "checkout", "account", "newsletter", "cookies"] as const
export type ConsentPlacement = (typeof CONSENT_PLACEMENTS)[number]

export const COOKIE_CATEGORIES = ["necessary", "analytics", "marketing"] as const
export type CookieCategory = (typeof COOKIE_CATEGORIES)[number]

export const CONSENT_SOURCES = ["storefront", "admin", "link", "import"] as const
export type ConsentSource = (typeof CONSENT_SOURCES)[number]

export const REQUEST_TYPES = ["access", "portability", "erasure", "objection", "rectification"] as const
export type RequestType = (typeof REQUEST_TYPES)[number]

/**
 * `unverified`: waits for the e-mail link; `open`: verified, waits for the
 * team; `accepted`: the team agreed and works on it; `completed` and
 * `rejected` are final; `expired`: never verified.
 */
export const REQUEST_STATUSES = ["unverified", "open", "accepted", "completed", "rejected", "expired"] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const REQUEST_ACTIONS = [
  "submitted",
  "verified",
  "accepted",
  "rejected",
  "exported",
  "anonymized",
  "completed",
  "noted",
  "expired",
  "due_soon",
] as const
export type RequestAction = (typeof REQUEST_ACTIONS)[number]

export type ActorType = "customer" | "user" | "system"

/* Omnibus ------------------------------------------------------------------- */

export const PRICE_SOURCES = ["snapshot", "change", "job"] as const
export type PriceSource = (typeof PRICE_SOURCES)[number]

export const DISCOUNT_KINDS = ["price_list", "promotion"] as const
export type DiscountKind = (typeof DISCOUNT_KINDS)[number]

/** Exceptions set per product or category, off unless the owner adds them. */
export const OMNIBUS_RULES = ["exempt", "gradual"] as const
export type OmnibusRule = (typeof OMNIBUS_RULES)[number]
