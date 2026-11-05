import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { readFulfillmentData } from "../lib/data"
import { APACZKA_MODULE } from "../modules/apaczka"
import type ApaczkaModuleService from "../modules/apaczka/service"
import { createApaczkaShipmentWorkflow } from "../workflows/create-apaczka-shipment"
import { syncApaczkaShipmentRecordWorkflow } from "../workflows/sync-apaczka-shipment-record"

type Payload = { order_id: string; return_id: string }

/**
 * Medusa does not give fulfillment providers the customer's address for
 * returns, so return labels are created here, right after the return is
 * confirmed. In `manual` mode the return is only recorded, and staff
 * create the label from the order page.
 */
export default async function apaczkaReturnRequested({ event, container }: SubscriberArgs<Payload>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)

  const { data: returns } = await query.graph({
    entity: "return",
    filters: { id: event.data.return_id },
    fields: ["id", "fulfillments.id", "fulfillments.provider_id", "fulfillments.data", "fulfillments.canceled_at"],
  })

  const fulfillments = (
    (returns[0]?.fulfillments ?? []) as Array<{
      id: string
      provider_id: string | null
      data: unknown
      canceled_at: Date | null
    } | null>
  ).filter(
    (f): f is NonNullable<typeof f> => Boolean(f) && !f!.canceled_at && Boolean(f!.provider_id?.startsWith("apaczka_"))
  )

  for (const fulfillment of fulfillments) {
    const state = readFulfillmentData(fulfillment.data).apaczka
    try {
      if ((await apaczka.getOptions()).shipmentCreation === "auto" && state?.state === "pending") {
        await createApaczkaShipmentWorkflow(container).run({ input: { fulfillment_id: fulfillment.id } })
      } else {
        await syncApaczkaShipmentRecordWorkflow(container).run({ input: { fulfillment_id: fulfillment.id } })
      }
    } catch (error) {
      logger.error(
        `[apaczka] Could not create the return label for return ${event.data.return_id}: ${(error as Error).message}. ` +
          "Create it from the order page."
      )
      await syncApaczkaShipmentRecordWorkflow(container)
        .run({ input: { fulfillment_id: fulfillment.id } })
        .catch(() => undefined)
    }
  }
}

export const config: SubscriberConfig = {
  event: "order.return_requested",
  context: { subscriberId: "apaczka-return-requested" },
}
