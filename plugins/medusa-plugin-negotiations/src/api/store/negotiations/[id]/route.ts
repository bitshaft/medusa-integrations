import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { actorId, customerThreadView, storeRoute } from "../../../../lib/negotiations/api/utils"
import { customerThread, requireCustomer, sweep } from "../../../../lib/negotiations/server/threads"

/** `GET /store/negotiations/:id`: one thread with its messages, without internal notes. */
export const GET = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const customer = await requireCustomer(req.scope, actorId(req))
  await sweep(req.scope)
  const thread = await customerThread(req.scope, customer.id, req.params.id)
  res.json({ negotiation: await customerThreadView(req, thread, true) })
})
