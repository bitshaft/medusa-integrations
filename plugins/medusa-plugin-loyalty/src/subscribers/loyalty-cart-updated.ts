import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { syncCartGifts } from "../lib/loyalty/server/rewards"

/** A gift removed from the cart before the order gives its points back. */
export default async function loyaltyCartUpdated({ event, container }: SubscriberArgs<{ id: string }>) {
  await syncCartGifts(container, event.data.id)
}

export const config: SubscriberConfig = {
  event: "cart.updated",
  context: { subscriberId: "loyalty-cart-updated" },
}
