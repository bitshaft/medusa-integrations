import { emitEventStep, updateFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import type { ApaczkaAddress } from "../lib/apaczka"
import type { ShipmentOverrides } from "../lib/data"
import { ApaczkaEvents, type ApaczkaShipmentEventData } from "../lib/events"
import { createApaczkaOrderStep } from "./steps/create-apaczka-order"
import { loadShipmentContextStep } from "./steps/load-shipment-context"
import { upsertShipmentRecordStep } from "./steps/upsert-shipment-record"

export type CreateApaczkaShipmentWorkflowInput = {
  /** An existing fulfillment that uses an Apaczka shipping option. */
  fulfillment_id: string
  /** Staff adjustments: parcels, pickup, COD, insurance, point, options… */
  overrides?: ShipmentOverrides
  /** Fully resolved sender address, bypassing the stock location. */
  sender?: ApaczkaAddress
}

export const createApaczkaShipmentWorkflowId = "apaczka-create-shipment"

/**
 * Creates the Apaczka order for an existing fulfillment (manual mode, return
 * labels, or a retry after the automatic attempt was deferred), then stores
 * the result on the fulfillment and in the shipment table.
 *
 * Every step compensates: if anything after `order_send` fails, the Apaczka
 * order is canceled again.
 *
 * @example
 * await createApaczkaShipmentWorkflow(container).run({
 *   input: { fulfillment_id: "ful_123", overrides: { parcels: [{ weight: 2, length: 30, width: 20, height: 10 }] } },
 * })
 */
export const createApaczkaShipmentWorkflow = createWorkflow(
  createApaczkaShipmentWorkflowId,
  (input: CreateApaczkaShipmentWorkflowInput) => {
    const context = loadShipmentContextStep({ fulfillment_id: input.fulfillment_id })

    const created = createApaczkaOrderStep({
      context,
      overrides: input.overrides,
      sender: input.sender,
    })

    const fulfillmentUpdate = transform({ context, created }, ({ context, created }) => ({
      id: context.fulfillment_id,
      data: { ...context.data, apaczka: created.state },
      labels: created.labels,
    }))
    updateFulfillmentWorkflow.runAsStep({ input: fulfillmentUpdate })

    const recordInput = transform({ context, created }, ({ context, created }) => ({
      fulfillment_id: context.fulfillment_id,
      order_id: context.order_id,
      return_id: context.return_id,
      state: created.state,
      pickup: created.payload.pickup
        ? {
            type: created.payload.pickup.type,
            date: created.payload.pickup.type === "COURIER" ? created.payload.pickup.date : undefined,
          }
        : null,
    }))
    const shipment = upsertShipmentRecordStep(recordInput)

    const eventData = transform({ shipment, context }, ({ shipment, context }): ApaczkaShipmentEventData => ({
      id: shipment.id,
      fulfillment_id: context.fulfillment_id,
      order_id: context.order_id,
      status: shipment.status,
      waybill_number: shipment.waybill_number,
      tracking_url: shipment.tracking_url,
      is_return: shipment.is_return,
    }))
    emitEventStep({ eventName: ApaczkaEvents.SHIPMENT_CREATED, data: eventData })

    return new WorkflowResponse(shipment)
  }
)
