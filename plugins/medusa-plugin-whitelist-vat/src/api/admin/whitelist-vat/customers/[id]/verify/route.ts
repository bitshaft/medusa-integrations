import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeRecord, resolveEnabled } from "../../../../../../lib/whitelist-vat/api/utils"
import type { AdminRecordVerifyBody } from "../../../../../../lib/whitelist-vat/api/validators"
import { verifyCustomer } from "../../../../../../lib/whitelist-vat/records"

/**
 * `POST /admin/whitelist-vat/customers/:id/verify` — verifies the tax ID
 * kept on the customer now. `force` (default true here) asks the registers
 * even when a recent answer is stored.
 */
export async function POST(req: MedusaRequest<AdminRecordVerifyBody>, res: MedusaResponse) {
  const { service, options } = await resolveEnabled(req)
  const { tax_id: taxId, verification } = await verifyCustomer(req.scope, req.params.id, {
    force: req.validatedBody.force ?? true,
    trigger: "admin",
  })
  res.json({ verification, ...(await describeRecord(service, options, taxId, { customer_id: req.params.id })) })
}
