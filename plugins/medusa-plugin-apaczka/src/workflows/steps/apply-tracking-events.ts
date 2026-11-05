import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { isShipped, ShipmentStatus } from "../../lib/apaczka/statuses"
import { latestEvent } from "../../lib/tracking"
import { APACZKA_MODULE } from "../../modules/apaczka"
import type ApaczkaModuleService from "../../modules/apaczka/service"
import type { TrackingEventInput } from "../../modules/apaczka/service"

export type ApplyTrackingEventsInput = {
  shipment_id: string
  events: TrackingEventInput[]
}

export type ApplyTrackingEventsResult = {
  shipment_id: string
  fulfillment_id: string
  order_id: string | null
  is_return: boolean
  previous_status: ShipmentStatus
  status: ShipmentStatus
  changed: boolean
  new_events: number
  waybill_number: string | null
  tracking_url: string | null
  mark_shipped: boolean
  mark_delivered: boolean
  shipment_items: Array<{ id: string; quantity: number }>
}

type Compensation = {
  shipment_id: string
  event_ids: string[]
  previous: Record<string, unknown>
}

export const applyTrackingEventsStepId = "apaczka-apply-tracking-events"

/**
 * Stores new tracking events, moves the shipment to the latest status and
 * decides whether the Medusa fulfillment should be marked shipped/delivered.
 *
 * Events are deduplicated, and the status only moves to an event that is
 * newer than the last applied one, so redelivered or out-of-order webhooks
 * never move a shipment backwards.
 */
export const applyTrackingEventsStep = createStep(
  applyTrackingEventsStepId,
  async (input: ApplyTrackingEventsInput, { container }) => {
    const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const options = apaczka.getOptions()

    const shipment = await apaczka.retrieveApaczkaShipment(input.shipment_id).catch(() => null)
    if (!shipment) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Apaczka shipment ${input.shipment_id} was not found`)
    }

    const fresh = await apaczka.recordTrackingEvents(shipment.id, input.events)
    const latest = latestEvent(fresh)
    const lastAppliedAt = shipment.last_event_at ? new Date(shipment.last_event_at) : undefined
    const isNewer = latest && (!lastAppliedAt || latest.occurred_at > lastAppliedAt)

    const previousStatus = shipment.status as ShipmentStatus
    const status = isNewer && latest ? (latest.status as ShipmentStatus) : previousStatus
    const now = new Date()

    const previous = {
      id: shipment.id,
      status: shipment.status,
      raw_status: shipment.raw_status,
      last_event_at: shipment.last_event_at,
      last_synced_at: shipment.last_synced_at,
      shipped_at: shipment.shipped_at,
      delivered_at: shipment.delivered_at,
      canceled_at: shipment.canceled_at,
    }

    await apaczka.updateApaczkaShipments({
      id: shipment.id,
      last_synced_at: now,
      ...(isNewer && latest
        ? {
            status,
            raw_status: latest.raw_status,
            last_event_at: latest.occurred_at,
            shipped_at: shipment.shipped_at ?? (isShipped(status) ? latest.occurred_at : null),
            delivered_at: shipment.delivered_at ?? (status === ShipmentStatus.DELIVERED ? latest.occurred_at : null),
            canceled_at: shipment.canceled_at ?? (status === ShipmentStatus.CANCELED ? latest.occurred_at : null),
          }
        : {}),
    })

    const {
      data: [fulfillment],
    } = await query.graph({
      entity: "fulfillment",
      filters: { id: shipment.fulfillment_id },
      fields: ["id", "shipped_at", "delivered_at", "canceled_at", "items.line_item_id", "items.quantity"],
    })

    const canTouchFulfillment =
      Boolean(fulfillment) && !fulfillment.canceled_at && Boolean(shipment.order_id) && !shipment.is_return

    const result: ApplyTrackingEventsResult = {
      shipment_id: shipment.id,
      fulfillment_id: shipment.fulfillment_id,
      order_id: shipment.order_id ?? null,
      is_return: shipment.is_return,
      previous_status: previousStatus,
      status,
      changed: status !== previousStatus,
      new_events: fresh.length,
      waybill_number: shipment.waybill_number ?? null,
      tracking_url: shipment.tracking_url ?? null,
      mark_shipped:
        options.tracking.markShipped && canTouchFulfillment && isShipped(status) && !fulfillment?.shipped_at,
      mark_delivered:
        options.tracking.markDelivered &&
        canTouchFulfillment &&
        status === ShipmentStatus.DELIVERED &&
        !fulfillment?.delivered_at,
      shipment_items: ((fulfillment?.items ?? []) as Array<{ line_item_id: string | null; quantity: number }>)
        .filter((item) => item.line_item_id)
        .map((item) => ({ id: item.line_item_id!, quantity: Number(item.quantity) })),
    }

    return new StepResponse<ApplyTrackingEventsResult, Compensation>(result, {
      shipment_id: shipment.id,
      event_ids: fresh.map((event) => event.id),
      previous,
    })
  },
  async (compensation, { container }) => {
    if (!compensation) {
      return
    }
    const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
    if (compensation.event_ids.length) {
      await apaczka.deleteApaczkaTrackingEvents(compensation.event_ids)
    }
    await apaczka.updateApaczkaShipments(compensation.previous as never)
  }
)
