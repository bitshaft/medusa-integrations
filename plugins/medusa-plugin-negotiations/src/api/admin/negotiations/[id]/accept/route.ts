import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { threadDetail } from "../../../../../lib/negotiations/api/admin"
import { actorId, adminRoute, parse } from "../../../../../lib/negotiations/api/utils"
import { AdminAccept } from "../../../../../lib/negotiations/api/validators"
import { teamAccept } from "../../../../../lib/negotiations/server/threads"

/** `POST /admin/negotiations/:id/accept`: accepts the customer's target (or our offer) at the price the person saw. */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const input = parse(AdminAccept, req.body)
  const { thread } = await teamAccept({ container: req.scope }, actorId(req), req.params.id, input)
  res.json(await threadDetail(req, thread))
})
