import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminId, requireEnabled } from "../../../../../../lib/loyalty/api/utils"
import type { AdminAdjust } from "../../../../../../lib/loyalty/api/validators"
import { adjustPoints } from "../../../../../../lib/loyalty/server/actions"

/** `POST /admin/loyalty/customers/:id/adjust` with `{ points, reason, request_id }` — a manual correction, signed with the admin user. */
export async function POST(req: MedusaRequest<AdminAdjust>, res: MedusaResponse) {
  await requireEnabled(req)
  const { points, reason, request_id } = req.validatedBody
  const result = await adjustPoints(req.scope, {
    customer_id: req.params.id,
    points,
    reason,
    admin_id: adminId(req),
    request_id,
  })
  res.json({ balance: result.balance, created: result.created.length > 0 })
}
