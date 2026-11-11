import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { handleEvent } from "../lib/emails/triggers"

/** Order confirmation, the store team's new order alert, cancellation and return emails. */
export default async function emailsOrderEvents({ event, container }: SubscriberArgs<Record<string, unknown>>) {
  await handleEvent(container, event.name, event.data)
}

export const config: SubscriberConfig = {
  event: ["order.placed", "order.canceled", "order.return_requested", "order.return_received"],
  context: { subscriberId: "emails-order-events" },
}
