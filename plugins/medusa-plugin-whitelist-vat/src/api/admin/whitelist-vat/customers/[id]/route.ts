import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeRecord, resolveEnabled } from "../../../../../lib/whitelist-vat/api/utils"
import { readTaxId } from "../../../../../lib/whitelist-vat/records"

/**
 * `GET /admin/whitelist-vat/customers/:id` — the customer panel's data:
 * the tax ID kept on the customer, the stored verdict for it and the
 * answers recorded for this customer. Asks no register.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service, options } = await resolveEnabled(req)
  const taxId = await readTaxId(req.scope, "customer", req.params.id)
  res.json(await describeRecord(service, options, taxId, { customer_id: req.params.id }))
}
