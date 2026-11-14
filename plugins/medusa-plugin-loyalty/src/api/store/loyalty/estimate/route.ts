import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { optionalCustomerId, requestLocale, requireEnabled } from "../../../../lib/loyalty/api/utils"
import { estimate } from "../../../../lib/loyalty/server/views"

/**
 * `GET /store/loyalty/estimate?amount=129.99` (a product price) or
 * `?cart_id=…` (the current cart) — the points it would earn, with the
 * signed-in customer's tier multiplier.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  const { amount, cart_id, locale } = req.validatedQuery as { amount?: number; cart_id?: string; locale?: string }
  res.json(
    await estimate(
      req.scope,
      { amount, cart_id, customer_id: optionalCustomerId(req) },
      await requestLocale(req, locale)
    )
  )
}
