import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { optionalCustomerId, requireEnabled } from "../../../../lib/coupons/api/utils"
import { progressForStore } from "../../../../lib/coupons/server/store"

/**
 * `GET /store/coupons/progress?cart_id=…` — for a "spend 120 zł more for 10%
 * off" bar: the tier reached and the next one, and how much is missing to
 * free shipping. Amounts are gross items before discounts, as the rules use.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  const { cart_id } = req.validatedQuery as { cart_id: string }
  res.json(await progressForStore(req.scope, cart_id, optionalCustomerId(req)))
}
