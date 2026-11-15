import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { threadDetail } from "../../../../lib/negotiations/api/admin"
import { adminRoute } from "../../../../lib/negotiations/api/utils"
import { sweep, teamThread } from "../../../../lib/negotiations/server/threads"

/** `GET /admin/negotiations/:id`: the thread with every message, internal notes included. */
export const GET = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await sweep(req.scope)
  res.json(await threadDetail(req, await teamThread(req.scope, req.params.id)))
})
