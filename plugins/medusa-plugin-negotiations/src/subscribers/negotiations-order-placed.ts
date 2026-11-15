import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { logger } from "../lib/negotiations/server/runtime"
import { recordOrderPlaced } from "../lib/negotiations/server/writers"

/** An order with negotiated lines closes the thread for further cart writes. */
export default async function negotiationsOrderPlaced({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    await recordOrderPlaced(container, event.data.id)
  } catch (error) {
    logger(container).warn(`[negotiations] Could not record order ${event.data.id}: ${(error as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: { subscriberId: "negotiations-order-placed" },
}
