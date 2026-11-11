import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { handleEvent } from "../lib/emails/triggers"

/** "Shipped" and "delivered" emails, with tracking numbers from the fulfillment's labels. */
export default async function emailsFulfillmentEvents({ event, container }: SubscriberArgs<Record<string, unknown>>) {
  await handleEvent(container, event.name, event.data)
}

export const config: SubscriberConfig = {
  event: ["shipment.created", "delivery.created"],
  context: { subscriberId: "emails-fulfillment-events" },
}
