import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { actorId, customerThreadView, parse, storeRoute } from "../../../../../lib/negotiations/api/utils"
import { StoreAccept } from "../../../../../lib/negotiations/api/validators"
import { customerAccept } from "../../../../../lib/negotiations/server/threads"

/** `POST /store/negotiations/:id/accept`: accepts the counter-offer at the price the customer saw. */
export const POST = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const input = parse(StoreAccept, req.body)
  const { thread } = await customerAccept({ container: req.scope }, actorId(req), req.params.id, input)
  res.json({ negotiation: await customerThreadView(req, thread, true) })
})
