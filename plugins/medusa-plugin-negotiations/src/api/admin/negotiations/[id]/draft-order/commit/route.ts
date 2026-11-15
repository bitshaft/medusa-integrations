import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { actorId, adminRoute, parse } from "../../../../../../lib/negotiations/api/utils"
import { AdminCommit } from "../../../../../../lib/negotiations/api/validators"
import { commitDraftOrder } from "../../../../../../lib/negotiations/server/writers"

/** `POST /admin/negotiations/:id/draft-order/commit`: creates the draft order, once per thread, after a matching dry run. */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const { dry_run_id } = parse(AdminCommit, req.body)
  const result = await commitDraftOrder(req.scope, { type: "user", id: actorId(req) }, req.params.id, dry_run_id)
  res.json({ order_id: result.order_id })
})
