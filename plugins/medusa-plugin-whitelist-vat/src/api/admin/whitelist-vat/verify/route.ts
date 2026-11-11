import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeSubject, resolveEnabled } from "../../../../lib/whitelist-vat/api/utils"
import type { AdminVerifyBody } from "../../../../lib/whitelist-vat/api/validators"
import { verifyAndEmit } from "../../../../lib/whitelist-vat/records"

/**
 * `POST /admin/whitelist-vat/verify` — manual lookup of a NIP or EU VAT
 * number. Returns the verdict, what each register said and the stored
 * business. `force` skips the stored answer.
 */
export async function POST(req: MedusaRequest<AdminVerifyBody>, res: MedusaResponse) {
  const { service, options } = await resolveEnabled(req)
  const { number, country_code, force } = req.validatedBody

  const verification = await verifyAndEmit(req.scope, { number, country_code, force, trigger: "admin" })
  const subject = verification.tax_id.valid ? await service.findSubject(verification.tax_id.number) : null
  res.json({ verification, subject: subject ? describeSubject(subject, options) : null })
}
