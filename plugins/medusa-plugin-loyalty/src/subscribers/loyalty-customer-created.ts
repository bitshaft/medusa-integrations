import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { awardAction } from "../lib/loyalty/server/actions"

/** Sign-up bonus for customers who create an account (guests get none). */
export default async function loyaltyCustomerCreated({ event, container }: SubscriberArgs<{ id: string }>) {
  await awardAction(container, event.data.id, "signup")
}

export const config: SubscriberConfig = {
  event: "customer.created",
  context: { subscriberId: "loyalty-customer-created" },
}
