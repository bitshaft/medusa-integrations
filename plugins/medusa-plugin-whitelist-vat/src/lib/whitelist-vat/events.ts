/**
 * Events emitted by the plugin. Subscribe to them to react to a verdict,
 * for example to flag an order for review or to tell your accounting system:
 *
 * ```ts
 * export const config: SubscriberConfig = { event: WhitelistVatEvents.VERIFIED }
 * ```
 *
 * `VERIFIED` is emitted after the registers were asked (not for answers
 * served from the cache), with `WhitelistVatVerifiedData`.
 */
export const WhitelistVatEvents = {
  VERIFIED: "whitelist-vat.tax_id.verified",
} as const

export type WhitelistVatVerifiedData = {
  /** Canonical tax ID. */
  number: string
  /** `active`, `exempt`, `unregistered`, `inactive`, `valid`, `invalid`, `not_found` or `unverified`. */
  status: string
  verified: boolean
  could_not_verify: boolean
  subject_id: string | null
  order_id: string | null
  customer_id: string | null
}
