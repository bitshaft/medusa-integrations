import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveApaczka } from "../../../utils"
import type { AdminPickupHoursQuery } from "../../../validators"

/** `GET /admin/apaczka/pickup-hours?postal_code=00-001&service_id=21` — available courier pickup days. */
export async function GET(req: MedusaRequest<unknown, AdminPickupHoursQuery>, res: MedusaResponse) {
  const { postal_code, service_id } = req.validatedQuery as AdminPickupHoursQuery
  const result = await (await resolveApaczka(req).getClient()).getPickupHours({ postal_code, service_id })
  res.json(result)
}
