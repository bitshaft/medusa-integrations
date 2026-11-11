import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeRecord, resolveEnabled } from "../../../../../../lib/whitelist-vat/api/utils"
import type { AdminRecordVerifyBody } from "../../../../../../lib/whitelist-vat/api/validators"
import { verifyOrder } from "../../../../../../lib/whitelist-vat/records"

/**
 * `POST /admin/whitelist-vat/orders/:id/verify` — verifies the order's tax
 * ID now and adds the answers to the order's history. `force` (default
 * true here) asks the registers even when a recent answer is stored.
 */
export async function POST(req: MedusaRequest<AdminRecordVerifyBody>, res: MedusaResponse) {
  const { service, options } = await resolveEnabled(req)
  const { tax_id: taxId, verification } = await verifyOrder(req.scope, req.params.id, {
    force: req.validatedBody.force ?? true,
    trigger: "admin",
  })
  res.json({ verification, ...(await describeRecord(service, options, taxId, { order_id: req.params.id })) })
}
