import type { MedusaContainer } from "@medusajs/framework/types"

import { eventsFromPolling } from "../../lib/tracking"
import { APACZKA_MODULE } from "../../modules/apaczka"
import type ApaczkaModuleService from "../../modules/apaczka/service"
import { syncApaczkaTrackingWorkflow } from "../sync-apaczka-tracking"

export type PollResult = { shipment_id: string; new_events: number; status: string; changed: boolean }

/**
 * Fetches tracking for one shipment from `tracking/{waybill}/` and applies
 * it. Shipments without a waybill number are only touched (`last_synced_at`).
 */
export async function pollShipmentTracking(container: MedusaContainer, shipmentId: string): Promise<PollResult> {
  const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
  const shipment = await apaczka.retrieveApaczkaShipment(shipmentId)

  const events = shipment.waybill_number
    ? eventsFromPolling((await apaczka.getClient().getTracking(shipment.waybill_number)).data)
    : []

  const { result } = await syncApaczkaTrackingWorkflow(container).run({
    input: { shipment_id: shipment.id, events },
  })

  return {
    shipment_id: shipment.id,
    new_events: result.new_events,
    status: result.status,
    changed: result.changed,
  }
}
