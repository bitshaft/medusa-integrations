import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requestLocale, requireEnabled } from "../../../../lib/coupons/api/utils"
import type { StoreCheckCoupon } from "../../../../lib/coupons/api/validators"
import { checkForStore } from "../../../../lib/coupons/server/store"

/**
 * `POST /store/coupons/check` with `{ cart_id, code, locale? }` — whether the
 * code would be accepted on this cart, before adding it. Nothing changes.
 *
 * - `{ valid: true, description }` — add it with `POST /store/carts/:id/promotions`.
 * - `{ valid: false, reason, message }` — show `message` (in `locale`).
 * - `{ valid: null }` — a promotion not managed by this plugin; core decides when it is added.
 */
export async function POST(req: MedusaRequest<StoreCheckCoupon>, res: MedusaResponse) {
  await requireEnabled(req)
  const { cart_id, code, locale } = req.validatedBody
  res.json(await checkForStore(req.scope, { cart_id, code }, await requestLocale(req, locale)))
}
