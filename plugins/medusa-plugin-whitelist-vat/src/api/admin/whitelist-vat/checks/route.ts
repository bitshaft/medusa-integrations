import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeCheck, resolveEnabled } from "../../../../lib/whitelist-vat/api/utils"
import type { AdminChecksQueryParams } from "../../../../lib/whitelist-vat/api/validators"

/**
 * `GET /admin/whitelist-vat/checks` — the verification history, newest
 * first: one row per answer of one register. Filter by `number`,
 * `order_id`, `customer_id` or `source`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const { limit, offset, ...filters } = req.validatedQuery as unknown as AdminChecksQueryParams

  const [checks, count] = await service.listAndCountWhitelistVatChecks(filters, {
    take: limit,
    skip: offset,
    order: { checked_at: "DESC" },
  })

  res.json({
    checks: checks.map((check) => describeCheck(check as unknown as Record<string, unknown>)),
    count,
    limit,
    offset,
  })
}
