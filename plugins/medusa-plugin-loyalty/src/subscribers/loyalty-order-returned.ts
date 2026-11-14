import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { revertReturnedUnits } from "../lib/loyalty/server/orders"

/** Returned units take back their share of the order's points (by value at purchase, not by refund). */
export default async function loyaltyOrderReturned({ event, container }: SubscriberArgs<{ order_id: string }>) {
  await revertReturnedUnits(container, event.data.order_id)
}

export const config: SubscriberConfig = {
  event: "order.return_received",
  context: { subscriberId: "loyalty-order-returned" },
}
