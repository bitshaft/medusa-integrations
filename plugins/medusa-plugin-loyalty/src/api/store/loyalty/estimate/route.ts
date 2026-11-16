import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { optionalCustomerId, requestLocale, requireEnabled } from "../../../../lib/loyalty/api/utils"
import { estimate } from "../../../../lib/loyalty/server/views"

/**
 * `GET /store/loyalty/estimate?amount=129.99&currency_code=eur` (a product price;
 * the currency defaults to the program's) or
 * `?cart_id=…` (the current cart) — the points it would earn, with the
 * signed-in customer's tier multiplier.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  const { amount, currency_code, cart_id, locale } = req.validatedQuery as {
    amount?: number
    currency_code?: string
    cart_id?: string
    locale?: string
  }
  res.json(
    await estimate(
      req.scope,
      { amount, currency_code, cart_id, customer_id: optionalCustomerId(req) },
      await requestLocale(req, locale)
    )
  )
}
