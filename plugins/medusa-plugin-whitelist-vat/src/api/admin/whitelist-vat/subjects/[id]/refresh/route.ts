import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { describeSubject, resolveEnabled } from "../../../../../../lib/whitelist-vat/api/utils"
import { verifyAndEmit } from "../../../../../../lib/whitelist-vat/records"
import type { SubjectRecord } from "../../../../../../lib/whitelist-vat/verify"

/**
 * `POST /admin/whitelist-vat/subjects/:id/refresh` — asks the registers
 * about a stored business again, whatever the age of the stored answer.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { service, options } = await resolveEnabled(req)
  const [subject] = (await service.listWhitelistVatSubjects(
    { id: req.params.id },
    { take: 1 }
  )) as unknown as SubjectRecord[]
  if (!subject) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Business ${req.params.id} was not found`)
  }

  const verification = await verifyAndEmit(req.scope, {
    number: subject.kind === "nip" ? `PL${subject.number}` : subject.number,
    force: true,
    trigger: "admin",
    customer_id: subject.customer_id,
  })
  const updated = await service.findSubject(subject.number)
  res.json({ verification, subject: updated ? describeSubject(updated, options) : null })
}
