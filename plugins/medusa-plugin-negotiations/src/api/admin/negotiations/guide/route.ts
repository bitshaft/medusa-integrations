import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminRoute } from "../../../../lib/negotiations/api/utils"
import { guideSteps } from "../../../../lib/negotiations/server/guide"

/** `GET /admin/negotiations/guide`: rollout steps with their status detected from this store. */
export const GET = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  res.json({ steps: await guideSteps(req.scope) })
})
