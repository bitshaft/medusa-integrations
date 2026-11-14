import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { awardOrder, markRewardsOrdered, orderIdForPayment } from "../lib/loyalty/server/orders"
import { logger } from "../lib/loyalty/server/runtime"

/**
 * Points once an order is fully paid. Both events lead here: with automatic
 * capture the payment can be captured before the order link exists. The
 * earn entry's key makes it count once.
 */
export default async function loyaltyOrderPaid({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    if (event.name === "order.placed") await markRewardsOrdered(container, event.data.id)
    const orderId =
      event.name === "payment.captured" ? await orderIdForPayment(container, event.data.id) : event.data.id
    if (orderId) await awardOrder(container, orderId)
  } catch (error) {
    logger(container).error(
      `[loyalty] Could not award points for ${event.name} ${event.data.id}: ${(error as Error).message}`
    )
    throw error
  }
}

export const config: SubscriberConfig = {
  event: ["payment.captured", "order.placed"],
  context: { subscriberId: "loyalty-order-paid" },
}
