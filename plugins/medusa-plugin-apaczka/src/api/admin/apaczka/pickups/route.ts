import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { bookApaczkaPickupWorkflow } from "../../../../workflows/apaczka/book-apaczka-pickup"
import type { AdminBookPickup } from "../../../../lib/apaczka/api/validators"

/** `POST /admin/apaczka/pickups` — book a courier pickup for one or more shipments. */
export async function POST(req: MedusaRequest<AdminBookPickup>, res: MedusaResponse) {
  const { result } = await bookApaczkaPickupWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json(result)
}
