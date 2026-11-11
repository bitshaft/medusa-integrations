import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeRecord, resolveEnabled } from "../../../../../lib/whitelist-vat/api/utils"
import { readTaxId } from "../../../../../lib/whitelist-vat/records"

/**
 * `GET /admin/whitelist-vat/orders/:id` — the order panel's data: the tax
 * ID on the order, the stored verdict for it and the answers recorded for
 * this order. Asks no register.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service, options } = await resolveEnabled(req)
  const taxId = await readTaxId(req.scope, "order", req.params.id)
  res.json(await describeRecord(service, options, taxId, { order_id: req.params.id }))
}
