/** A Medusa order a Stripe object belongs to. */
export type OrderRef = { id: string; display_id: number | null }

/** The minimum of a PaymentIntent the mapping needs. */
export type IntentRef = {
  id: string
  status: string
  created: number
  metadata?: Record<string, string> | null
}

/**
 * The official Medusa provider writes the Medusa payment session id into the
 * PaymentIntent's metadata (`session_id`). That is the link to the order:
 * session → payment collection → order.
 */
export function sessionIdOf(intent: Pick<IntentRef, "metadata">): string | null {
  const id = intent.metadata?.session_id
  return typeof id === "string" && id.startsWith("payses_") ? id : null
}

/** Money was taken (or is held for capture). */
export const PAID_STATUSES = new Set(["succeeded", "requires_capture"])

/**
 * A payment that went through in Stripe but never became a Medusa order:
 * paid or authorised, no order found, and older than the grace period (an
 * order is created a moment after the payment, a slow webhook can take longer).
 */
export function isOrphan(intent: IntentRef, order: OrderRef | null, now: Date, graceMinutes: number): boolean {
  if (order || !PAID_STATUSES.has(intent.status)) return false
  return now.getTime() - intent.created * 1000 >= graceMinutes * 60_000
}
