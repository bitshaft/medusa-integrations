/**
 * Events the plugin listens to or emits, besides Medusa's own.
 *
 * `PAYMENT_FAILED` is yours to emit: Medusa has no event for a failed
 * payment, so a payment integration or your own code reports it and the
 * plugin alerts the store team.
 *
 * ```ts
 * await eventBus.emit({
 *   name: EmailsEvents.PAYMENT_FAILED,
 *   data: { order_id, amount: 129.99, currency_code: "pln", reason: "Card declined", customer_email },
 * })
 * ```
 *
 * `MESSAGE_SENT` and `MESSAGE_FAILED` are emitted for every email with
 * `{ id, type, recipient, order_id, customer_id }` (`id` is the send log ID).
 */
export const EmailsEvents = {
  PAYMENT_FAILED: "emails.payment.failed",
  MESSAGE_SENT: "emails.message.sent",
  MESSAGE_FAILED: "emails.message.failed",
} as const

export type EmailsPaymentFailedData = {
  /** Used to deduplicate alerts; pass the payment or payment session ID when you have one. */
  payment_id?: string
  order_id?: string
  /** Major units, as Medusa stores amounts. */
  amount?: number
  currency_code?: string
  reason?: string
  customer_email?: string
  provider_id?: string
}
