import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { revertCanceledOrder } from "../lib/loyalty/server/orders"

/** A canceled order takes back everything earned for it, and refunds gifts in it. */
export default async function loyaltyOrderCanceled({ event, container }: SubscriberArgs<{ id: string }>) {
  await revertCanceledOrder(container, event.data.id)
}

export const config: SubscriberConfig = {
  event: "order.canceled",
  context: { subscriberId: "loyalty-order-canceled" },
}
