import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { actorId, adminRoute, parse } from "../../../../../../lib/negotiations/api/utils"
import { AdminDraftChoices } from "../../../../../../lib/negotiations/api/validators"
import { dryRunDraftOrder } from "../../../../../../lib/negotiations/server/writers"

/** `POST /admin/negotiations/:id/draft-order/dry-run`: checks everything the write needs. Writes nothing to Medusa. */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const choices = parse(AdminDraftChoices, req.body)
  res.json(await dryRunDraftOrder(req.scope, { type: "user", id: actorId(req) }, req.params.id, choices))
})
