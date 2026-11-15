import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { actorId, customerThreadView, parse, storeRoute } from "../../../../../lib/negotiations/api/utils"
import { StoreWithdraw } from "../../../../../lib/negotiations/api/validators"
import { customerWithdraw } from "../../../../../lib/negotiations/server/threads"

/** `POST /store/negotiations/:id/withdraw`: the customer ends the negotiation. */
export const POST = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const input = parse(StoreWithdraw, req.body)
  const { thread } = await customerWithdraw({ container: req.scope }, actorId(req), req.params.id, input)
  res.json({ negotiation: await customerThreadView(req, thread, true) })
})
