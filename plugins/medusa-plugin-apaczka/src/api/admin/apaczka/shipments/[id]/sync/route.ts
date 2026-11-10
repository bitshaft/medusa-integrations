import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { pollShipmentTracking } from "../../../../../../workflows/apaczka/helpers/poll-tracking"
import { resolveApaczka } from "../../../../../../lib/apaczka/api/utils"

/** `POST /admin/apaczka/shipments/:id/sync` — fetch tracking from Apaczka now. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const result = await pollShipmentTracking(req.scope, req.params.id)
  const shipment = await resolveApaczka(req).retrieveApaczkaShipment(req.params.id, { relations: ["events"] })
  res.json({ result, shipment })
}
