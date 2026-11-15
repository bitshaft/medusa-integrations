import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { actorId, customerThreadView, parse, storeRoute } from "../../../lib/negotiations/api/utils"
import { StoreListQuery, StoreOpen } from "../../../lib/negotiations/api/validators"
import { resolveNegotiations } from "../../../lib/negotiations/server/runtime"
import { openThread, requireCustomer, sweep } from "../../../lib/negotiations/server/threads"

/** `GET /store/negotiations`: the signed-in customer's threads, newest activity first. */
export const GET = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const customer = await requireCustomer(req.scope, actorId(req))
  const query = parse(StoreListQuery, req.query)
  await sweep(req.scope)
  const { threads, count } = await resolveNegotiations(req.scope).listThreads({
    is_demo: false,
    customer_id: customer.id,
    status: query.status,
    limit: query.limit,
    offset: query.offset,
  })
  res.json({
    negotiations: await Promise.all(threads.map((t) => customerThreadView(req, t, false))),
    count,
    limit: query.limit,
    offset: query.offset,
  })
})

/** `POST /store/negotiations`: asks for a price for a product or variant, or for the whole cart. */
export const POST = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const input = parse(StoreOpen, req.body)
  const { thread } = await openThread({ container: req.scope }, actorId(req), input)
  res.status(201).json({ negotiation: await customerThreadView(req, thread, true) })
})
