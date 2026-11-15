import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { threadDetail } from "../../../../../lib/negotiations/api/admin"
import { adminRoute, parse } from "../../../../../lib/negotiations/api/utils"
import { AdminAssign } from "../../../../../lib/negotiations/api/validators"
import { resolveNegotiations } from "../../../../../lib/negotiations/server/runtime"
import { teamThread } from "../../../../../lib/negotiations/server/threads"

/** `POST /admin/negotiations/:id/assign`: sets (or clears) the person leading the thread. */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const { user_id } = parse(AdminAssign, req.body)
  await teamThread(req.scope, req.params.id)
  const thread = await resolveNegotiations(req.scope).assign(req.params.id, user_id)
  res.json(await threadDetail(req, thread))
})
