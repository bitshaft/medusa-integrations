import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../lib/whitelist-vat/api/utils"
import type { AdminCheckBankAccountBody } from "../../../../lib/whitelist-vat/api/validators"

/**
 * `POST /admin/whitelist-vat/bank-account` — asks the white list whether a
 * bank account is registered for a NIP today, e.g. before paying a
 * supplier. `assigned` is `true` or `false` as the register answered, or
 * `null` with a `problem` (`invalid_nip`, `invalid_account`, `unavailable`).
 */
export async function POST(req: MedusaRequest<AdminCheckBankAccountBody>, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const { nip, account } = req.validatedBody
  const result = await service.checkBankAccount(nip, account)
  res.json({
    assigned: result.assigned,
    problem: result.problem ?? null,
    error: result.error,
    request_id: result.request_id,
    checked_at: result.checked_at,
  })
}
