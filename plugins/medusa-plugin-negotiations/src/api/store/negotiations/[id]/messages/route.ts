import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { actorId, customerThreadView, parse, storeRoute } from "../../../../../lib/negotiations/api/utils"
import { StoreReply } from "../../../../../lib/negotiations/api/validators"
import { customerReply } from "../../../../../lib/negotiations/server/threads"

/** `POST /store/negotiations/:id/messages`: a message, optionally with a new target price. */
export const POST = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const input = parse(StoreReply, req.body)
  const { thread } = await customerReply({ container: req.scope }, actorId(req), req.params.id, input)
  res.json({ negotiation: await customerThreadView(req, thread, true) })
})
