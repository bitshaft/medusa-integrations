import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { threadDetail } from "../../../../../lib/negotiations/api/admin"
import { actorId, adminRoute, parse } from "../../../../../lib/negotiations/api/utils"
import { AdminReject } from "../../../../../lib/negotiations/api/validators"
import { teamReject } from "../../../../../lib/negotiations/server/threads"

/** `POST /admin/negotiations/:id/reject`: ends the negotiation with a reason the customer sees. */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const input = parse(AdminReject, req.body)
  const { thread } = await teamReject({ container: req.scope }, actorId(req), req.params.id, input)
  res.json(await threadDetail(req, thread))
})
