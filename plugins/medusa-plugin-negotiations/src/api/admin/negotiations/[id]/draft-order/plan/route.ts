import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { actorId, adminRoute, parse } from "../../../../../../lib/negotiations/api/utils"
import { AdminDraftChoices } from "../../../../../../lib/negotiations/api/validators"
import { recordPlan } from "../../../../../../lib/negotiations/server/writers"

/** `POST /admin/negotiations/:id/draft-order/plan`: what the draft order would be (region, address, channel, lines). Writes nothing. */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const choices = parse(AdminDraftChoices, req.body)
  res.json(await recordPlan(req.scope, { type: "user", id: actorId(req) }, req.params.id, choices))
})
