import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminId, requireEnabled } from "../../../../../../lib/loyalty/api/utils"
import { awardAction } from "../../../../../../lib/loyalty/server/actions"

/** `POST /admin/loyalty/customers/:id/newsletter` — grants the newsletter bonus by hand (still once per customer). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  const points = await awardAction(req.scope, req.params.id, "newsletter", { type: "admin", id: adminId(req) })
  res.json({ points, granted: points > 0 })
}
