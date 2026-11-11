import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { EmailsEvents } from "../lib/emails/events"
import { handleEvent } from "../lib/emails/triggers"

/**
 * Payment received and refund emails, and the store team's alert for failed
 * payments. Medusa has no event for a failed payment, so that one is
 * `emails.payment.failed`, emitted by a payment integration or your own code.
 */
export default async function emailsPaymentEvents({ event, container }: SubscriberArgs<Record<string, unknown>>) {
  await handleEvent(container, event.name, event.data)
}

export const config: SubscriberConfig = {
  event: ["payment.captured", "payment.refunded", EmailsEvents.PAYMENT_FAILED],
  context: { subscriberId: "emails-payment-events" },
}
