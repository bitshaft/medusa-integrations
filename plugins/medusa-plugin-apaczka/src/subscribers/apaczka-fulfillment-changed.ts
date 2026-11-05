import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { syncApaczkaShipmentRecordWorkflow } from "../workflows/sync-apaczka-shipment-record"

type Payload = { order_id: string; fulfillment_id: string }

/**
 * Mirrors Apaczka fulfillments into the shipment table when Medusa creates
 * or cancels them. Fulfillments of other providers are ignored.
 */
export default async function apaczkaFulfillmentChanged({ event, container }: SubscriberArgs<Payload>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    await syncApaczkaShipmentRecordWorkflow(container).run({
      input: { fulfillment_id: event.data.fulfillment_id },
    })
  } catch (error) {
    logger.error(
      `[apaczka] Could not sync shipment for fulfillment ${event.data.fulfillment_id}: ${(error as Error).message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: ["order.fulfillment_created", "order.fulfillment_canceled"],
  context: { subscriberId: "apaczka-fulfillment-changed" },
}
