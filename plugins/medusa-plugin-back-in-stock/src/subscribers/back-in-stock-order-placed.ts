import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { resolveBackInStock } from "../lib/back-in-stock/runtime"

/**
 * Ends the subscriptions of a buyer for the variants they ordered, matched
 * by customer account or by email address: they got what they waited for.
 */
export default async function backInStockOrderPlaced({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = resolveBackInStock(container)
  try {
    if (!(await service.isEnabled())) {
      return
    }
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "email", "customer_id", "items.variant_id"],
      filters: { id: event.data.id },
    })
    const order = data[0] as
      | { email?: string | null; customer_id?: string | null; items?: Array<{ variant_id?: string | null } | null> }
      | undefined
    if (!order) {
      return
    }
    const variantIds = [
      ...new Set((order.items ?? []).map((item) => item?.variant_id).filter((id): id is string => Boolean(id))),
    ]
    const ended = await service.endForPurchase(variantIds, { customer_id: order.customer_id, email: order.email })
    if (ended) {
      logger.info(`[back-in-stock] Order ${event.data.id} ended ${ended} subscription(s)`)
    }
  } catch (error) {
    logger.warn(`[back-in-stock] Could not end subscriptions for order ${event.data.id}: ${(error as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: { subscriberId: "back-in-stock-order-placed" },
}
