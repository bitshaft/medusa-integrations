import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { Logger } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { ApaczkaWebhookError, verifyPushTrackingWebhook } from "../../../../lib/apaczka"
import { eventsFromWebhook } from "../../../../lib/tracking"
import { syncApaczkaTrackingWorkflow } from "../../../../workflows/sync-apaczka-tracking"
import { resolveApaczka } from "../../../utils"

/**
 * Receives Apaczka push-tracking notifications.
 *
 * - The signature is checked against the raw body; unsigned or tampered
 *   requests get HTTP 400 and change nothing.
 * - Apaczka redelivers until it gets HTTP 200, and holds back the next
 *   status until then, so known-but-irrelevant notifications (unknown order,
 *   empty status list) are acknowledged with 200. Processing is idempotent.
 * - Unexpected failures return 500 so the notification is retried.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const apaczka = resolveApaczka(req)
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const options = await apaczka.getOptions()

  const rawBody = (req as MedusaRequest & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body ?? {})

  let notification
  try {
    notification = verifyPushTrackingWebhook({
      appId: options.appId,
      appSecret: options.appSecret,
      rawBody,
    })
  } catch (error) {
    if (error instanceof ApaczkaWebhookError) {
      logger.warn(`[apaczka] Rejected tracking webhook: ${error.message}`)
      return res.status(400).json({ message: "Invalid webhook signature" })
    }
    throw error
  }

  const apaczkaOrderId = String(notification.orderNumber ?? "")
  const [shipment] = apaczkaOrderId
    ? await apaczka.listApaczkaShipments({ apaczka_order_id: apaczkaOrderId }, { take: 1 })
    : []

  if (!shipment) {
    logger.info(`[apaczka] Tracking webhook for unknown Apaczka order ${apaczkaOrderId || "(none)"}; acknowledged`)
    return res.status(200).json({ received: true, matched: false })
  }

  const events = eventsFromWebhook(notification)
  if (events.length) {
    await syncApaczkaTrackingWorkflow(req.scope).run({
      input: { shipment_id: shipment.id, events },
    })
  }

  return res.status(200).json({ received: true, matched: true, events: events.length })
}
