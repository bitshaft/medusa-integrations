import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { threadDetail } from "../../../../../lib/negotiations/api/admin"
import { actorId, adminRoute, parse } from "../../../../../lib/negotiations/api/utils"
import { AdminCounter } from "../../../../../lib/negotiations/api/validators"
import { teamCounter } from "../../../../../lib/negotiations/server/threads"

/** `POST /admin/negotiations/:id/counter`: a counter-offer with its own deadline. Below the minimum price it needs `confirm_below_floor`. */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const input = parse(AdminCounter, req.body)
  const { thread } = await teamCounter({ container: req.scope }, actorId(req), req.params.id, input)
  res.json(await threadDetail(req, thread))
})
