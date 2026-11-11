import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeSubject, PROBLEM_STATUSES, resolveEnabled, staleBefore } from "../../../../lib/whitelist-vat/api/utils"
import type { AdminSubjectsQueryParams } from "../../../../lib/whitelist-vat/api/validators"
import type { SubjectRecord } from "../../../../lib/whitelist-vat/verify"

/**
 * `GET /admin/whitelist-vat/subjects` — the businesses verified so far,
 * most recently checked first. `filter` narrows to `active`, `exempt`
 * (exempt payers and confirmed EU numbers), `problem` (anything that is not
 * a confirmed, registered business) or `stale` (answer older than the
 * cache time). `q` searches the number, name and address.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service, options } = await resolveEnabled(req)
  const { q, filter, limit, offset } = req.validatedQuery as unknown as AdminSubjectsQueryParams

  const filters: Record<string, unknown> = q ? { q } : {}
  if (filter === "active") {
    filters.status = "active"
  } else if (filter === "exempt") {
    filters.status = ["exempt", "valid"]
  } else if (filter === "problem") {
    filters.status = PROBLEM_STATUSES
  } else if (filter === "stale") {
    filters.$or = [{ checked_at: { $lt: staleBefore(options) } }, { checked_at: null }]
  }

  const [subjects, count] = await service.listAndCountWhitelistVatSubjects(filters, {
    take: limit,
    skip: offset,
    order: { updated_at: "DESC" },
  })

  res.json({
    subjects: (subjects as unknown as SubjectRecord[]).map((subject) => describeSubject(subject, options)),
    count,
    limit,
    offset,
  })
}
