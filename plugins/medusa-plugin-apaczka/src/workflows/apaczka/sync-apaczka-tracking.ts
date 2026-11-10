import {
  acquireLockStep,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
  releaseLockStep,
} from "@medusajs/medusa/core-flows"
import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import { ShipmentStatus } from "../../lib/apaczka/client/statuses"
import { ApaczkaEvents, type ApaczkaShipmentEventData } from "../../lib/apaczka/events"
import type { TrackingEventInput } from "../../modules/apaczka/service"
import { applyTrackingEventsStep } from "./steps/apply-tracking-events"
import { emitEventsStep } from "./steps/emit-events"

export type SyncApaczkaTrackingWorkflowInput = {
  shipment_id: string
  events: TrackingEventInput[]
}

export const syncApaczkaTrackingWorkflowId = "apaczka-sync-tracking"

const STATUS_EVENTS: Partial<Record<ShipmentStatus, string>> = {
  [ShipmentStatus.POSTED]: ApaczkaEvents.SHIPPED,
  [ShipmentStatus.READY_FOR_PICKUP]: ApaczkaEvents.READY_FOR_PICKUP,
  [ShipmentStatus.DELIVERED]: ApaczkaEvents.DELIVERED,
  [ShipmentStatus.EXCEPTION]: ApaczkaEvents.EXCEPTION,
  [ShipmentStatus.RETURNED]: ApaczkaEvents.RETURNED,
  [ShipmentStatus.CANCELED]: ApaczkaEvents.CANCELED,
}

/**
 * Applies tracking events (from a webhook or polling) to a shipment and,
 * when enabled in the options, marks the Medusa fulfillment as shipped and
 * delivered. Emits `apaczka.shipment.status_changed` plus a specific event
 * (`…delivered`, `…exception`, …) when the status moves.
 */
export const syncApaczkaTrackingWorkflow = createWorkflow(
  syncApaczkaTrackingWorkflowId,
  (input: SyncApaczkaTrackingWorkflowInput) => {
    // A webhook and the polling job may arrive at the same time.
    const lockKey = transform({ input }, ({ input }) => `apaczka:tracking:${input.shipment_id}`)
    acquireLockStep({ key: lockKey, timeout: 10, ttl: 120 })

    const result = applyTrackingEventsStep(input)

    when("apaczka-mark-shipped", result, (r) => r.mark_shipped).then(() => {
      const shipmentInput = transform({ result }, ({ result }) => ({
        order_id: result.order_id!,
        fulfillment_id: result.fulfillment_id,
        items: result.shipment_items,
      }))
      createOrderShipmentWorkflow.runAsStep({ input: shipmentInput })
    })

    when("apaczka-mark-delivered", result, (r) => r.mark_delivered).then(() => {
      const deliveredInput = transform({ result }, ({ result }) => ({
        orderId: result.order_id!,
        fulfillmentId: result.fulfillment_id,
      }))
      markOrderFulfillmentAsDeliveredWorkflow.runAsStep({ input: deliveredInput })
    })

    when("apaczka-status-changed", result, (r) => r.changed).then(() => {
      const events = transform({ result }, ({ result }) => {
        const data: ApaczkaShipmentEventData = {
          id: result.shipment_id,
          fulfillment_id: result.fulfillment_id,
          order_id: result.order_id,
          status: result.status,
          previous_status: result.previous_status,
          waybill_number: result.waybill_number,
          tracking_url: result.tracking_url,
          is_return: result.is_return,
        }
        const specific = STATUS_EVENTS[result.status]
        return [{ name: ApaczkaEvents.STATUS_CHANGED, data }, ...(specific ? [{ name: specific, data }] : [])]
      })
      emitEventsStep(events)
    })

    releaseLockStep({ key: lockKey })

    return new WorkflowResponse(result)
  }
)
