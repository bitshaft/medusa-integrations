import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { APACZKA_MODULE } from "../modules/apaczka"
import type ApaczkaModuleService from "../modules/apaczka/service"
import { missingWeights } from "../lib/apaczka/parcels"
import { MISSING_WEIGHT_REASON } from "../lib/apaczka/settings"
import { createApaczkaShipmentWorkflow } from "../workflows/apaczka/create-apaczka-shipment"
import { loadShipmentContext } from "../workflows/apaczka/steps/load-shipment-context"
import { syncApaczkaShipmentRecordWorkflow } from "../workflows/apaczka/sync-apaczka-shipment-record"

type Payload = { order_id: string; fulfillment_id: string }

/**
 * Mirrors Apaczka fulfillments into the shipment table when Medusa creates
 * or cancels them, and finishes shipments the provider deferred
 * (`auto_create`): COD shipments, whose amount depends on what is still
 * unpaid, shipments whose sender address needs the full stock location, and
 * shipments with a product without a weight (held when the Settings tab says so).
 * Fulfillments of other providers are ignored.
 */
export default async function apaczkaFulfillmentChanged({ event, container }: SubscriberArgs<Payload>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillmentId = event.data.fulfillment_id

  if (!(await container.resolve<ApaczkaModuleService>(APACZKA_MODULE).isEnabled())) {
    return
  }

  let record: { id: string; status: string } | undefined
  let autoCreate = false
  try {
    const { result } = await syncApaczkaShipmentRecordWorkflow(container).run({
      input: { fulfillment_id: fulfillmentId },
    })
    record = result.shipment as { id: string; status: string } | undefined
    autoCreate =
      event.name === "order.fulfillment_created" &&
      result.snapshot.state?.state === "pending" &&
      Boolean(result.snapshot.state?.auto_create) &&
      !result.snapshot.canceled
  } catch (error) {
    logger.error(`[apaczka] Could not sync shipment for fulfillment ${fulfillmentId}: ${(error as Error).message}`)
    return
  }

  if (!autoCreate) {
    return
  }

  // Optional (Settings tab): leave a shipment with a product without a weight
  // for a person to check, instead of sending a guessed weight to the carrier.
  const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
  if ((await apaczka.getSettings()).hold_without_weight) {
    try {
      const context = await loadShipmentContext(container, fulfillmentId)
      const missing = missingWeights(
        context.items.map((item) => ({ title: item.title, quantity: item.quantity, weight: item.variant?.weight }))
      )
      if (missing.length) {
        logger.info(
          `[apaczka] Held the shipment of fulfillment ${fulfillmentId}: ${missing.length} product(s) without a weight`
        )
        if (record) await apaczka.updateApaczkaShipments({ id: record.id, error: MISSING_WEIGHT_REASON })
        return
      }
    } catch (error) {
      logger.warn(`[apaczka] Could not check weights for fulfillment ${fulfillmentId}: ${(error as Error).message}`)
    }
  }

  try {
    await createApaczkaShipmentWorkflow(container).run({ input: { fulfillment_id: fulfillmentId } })
  } catch (error) {
    const message = (error as Error).message
    logger.error(`[apaczka] Could not create the shipment for fulfillment ${fulfillmentId}: ${message}`)
    // Show the reason in the order panel, where staff can retry.
    if (record) {
      await apaczka.updateApaczkaShipments({ id: record.id, error: message }).catch(() => undefined)
    }
  }
}

export const config: SubscriberConfig = {
  event: ["order.fulfillment_created", "order.fulfillment_canceled"],
  context: { subscriberId: "apaczka-fulfillment-changed" },
}
