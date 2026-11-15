import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminRoute } from "../../../../lib/negotiations/api/utils"
import { requireEnabled, sweep } from "../../../../lib/negotiations/server/threads"

/** `POST /admin/negotiations/expire`: "Expire inactive now", the same work as the hourly job. */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireEnabled(req.scope)
  res.json(await sweep(req.scope))
})
