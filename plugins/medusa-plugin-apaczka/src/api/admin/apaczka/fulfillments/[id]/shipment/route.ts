import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { createApaczkaShipmentWorkflow } from "../../../../../../workflows/create-apaczka-shipment"
import type { AdminCreateShipment } from "../../../../../validators"

/**
 * `POST /admin/apaczka/fulfillments/:id/shipment` — create the Apaczka order
 * for an existing fulfillment, optionally with adjusted parcels, pickup,
 * COD, insurance, point or additional services.
 */
export async function POST(req: MedusaRequest<AdminCreateShipment>, res: MedusaResponse) {
  const { result } = await createApaczkaShipmentWorkflow(req.scope).run({
    input: { fulfillment_id: req.params.id, overrides: req.validatedBody.overrides },
  })
  res.status(201).json({ shipment: result })
}
