import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../lib/loyalty/api/utils"
import { dashboardStats } from "../../../../lib/loyalty/server/views"

/** `GET /admin/loyalty/dashboard` — members, points in and out (30 days), open points and their value, tiers, top rewards, expiring points. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  res.json(await dashboardStats(req.scope))
}
