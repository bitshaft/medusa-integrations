import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { actorId, customerThreadView, parse, storeRoute } from "../../../../../lib/negotiations/api/utils"
import { StoreAddToCart } from "../../../../../lib/negotiations/api/validators"
import { addAgreedToCart } from "../../../../../lib/negotiations/server/writers"

/** `POST /store/negotiations/:id/add-to-cart`: the agreed lines into the customer's cart at the agreed prices. */
export const POST = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const { cart_id } = parse(StoreAddToCart, req.body)
  const result = await addAgreedToCart(req.scope, actorId(req), req.params.id, cart_id)
  res.json({
    cart_id: result.cart_id,
    line_item_ids: result.line_item_ids,
    negotiation: await customerThreadView(req, result.thread, true),
  })
})
