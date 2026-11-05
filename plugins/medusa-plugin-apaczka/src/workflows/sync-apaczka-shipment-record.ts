import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { ShipmentStatus } from "../lib/apaczka/statuses"
import { readFulfillmentData, type ApaczkaFulfillmentState } from "../lib/data"
import { ApaczkaEvents } from "../lib/events"
import { emitEventsStep } from "./steps/emit-events"
import { upsertShipmentRecordStep } from "./steps/upsert-shipment-record"

export type SyncApaczkaShipmentRecordInput = { fulfillment_id: string }

type FulfillmentSnapshot = {
  fulfillment_id: string
  order_id: string | null
  return_id: string | null
  state: ApaczkaFulfillmentState | null
  canceled: boolean
  existed: boolean
}

export const readFulfillmentStateStepId = "apaczka-read-fulfillment-state"

const readFulfillmentStep = createStep(
  readFulfillmentStateStepId,
  async (input: SyncApaczkaShipmentRecordInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [fulfillment],
    } = await query.graph({
      entity: "fulfillment",
      filters: { id: input.fulfillment_id },
      fields: ["id", "data", "canceled_at", "order.id", "return.id", "return.order_id", "apaczka_shipment.id"],
    })

    const state = readFulfillmentData(fulfillment?.data).apaczka ?? null
    const ret = (fulfillment as { return?: { id: string; order_id: string } | null } | undefined)?.return
    const snapshot: FulfillmentSnapshot = {
      fulfillment_id: input.fulfillment_id,
      order_id: (fulfillment as { order?: { id: string } | null } | undefined)?.order?.id ?? ret?.order_id ?? null,
      return_id: ret?.id ?? null,
      state:
        state && fulfillment?.canceled_at ? { ...state, state: "canceled", status: ShipmentStatus.CANCELED } : state,
      canceled: Boolean(fulfillment?.canceled_at),
      existed: Boolean((fulfillment as { apaczka_shipment?: { id: string } | null } | undefined)?.apaczka_shipment?.id),
    }
    return new StepResponse(snapshot)
  }
)

export const syncApaczkaShipmentRecordWorkflowId = "apaczka-sync-shipment-record"

/**
 * Mirrors `fulfillment.data.apaczka` into the shipment table. Runs after
 * Medusa creates or cancels an Apaczka fulfillment (see the subscribers).
 * Does nothing for fulfillments of other providers.
 */
export const syncApaczkaShipmentRecordWorkflow = createWorkflow(
  syncApaczkaShipmentRecordWorkflowId,
  (input: SyncApaczkaShipmentRecordInput) => {
    const snapshot = readFulfillmentStep(input)

    const shipment = when("apaczka-has-state", snapshot, (s) => Boolean(s.state)).then(() => {
      const recordInput = transform({ snapshot }, ({ snapshot }) => ({
        fulfillment_id: snapshot.fulfillment_id,
        order_id: snapshot.order_id,
        return_id: snapshot.return_id,
        state: snapshot.state!,
      }))
      const record = upsertShipmentRecordStep(recordInput)

      const events = transform({ snapshot, record }, ({ snapshot, record }) => {
        const data = {
          id: record.id,
          fulfillment_id: snapshot.fulfillment_id,
          order_id: snapshot.order_id,
          status: record.status,
          waybill_number: record.waybill_number,
          tracking_url: record.tracking_url,
          is_return: record.is_return,
        }
        if (snapshot.canceled) {
          return [{ name: ApaczkaEvents.CANCELED, data }]
        }
        if (!snapshot.existed && snapshot.state?.state === "created") {
          return [{ name: ApaczkaEvents.SHIPMENT_CREATED, data }]
        }
        return []
      })
      emitEventsStep(events)
      return record
    })

    return new WorkflowResponse({ snapshot, shipment })
  }
)
