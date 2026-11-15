import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { graph, resolveStripe } from "../lib/stripe/server/runtime"

/**
 * A payment was captured or refunded in Medusa: forget the cached Stripe
 * answers about its PaymentIntent, so the order widget reads Stripe again.
 * Nothing is fetched here.
 */
export default async function stripePaymentChanged({ event, container }: SubscriberArgs<{ id?: string }>) {
  const service = resolveStripe(container)
  if (!service.isEnabled() || !event.data.id) return
  const { data } = await graph(container)({
    entity: "payment",
    fields: ["id", "data", "provider_id"],
    filters: { id: event.data.id },
  })
  const intentId = data[0]?.data?.id
  if (typeof intentId === "string" && intentId.startsWith("pi_")) {
    service.invalidate(intentId)
    // Lists that may contain it (payments, overview) are refreshed on the next view.
    service.invalidate("/v1/payment_intents?")
    service.invalidate("/v1/charges?")
    service.invalidate("/v1/balance")
  }
}

export const config: SubscriberConfig = {
  event: ["payment.captured", "payment.refunded"],
  context: { subscriberId: "stripe-payment-changed" },
}
