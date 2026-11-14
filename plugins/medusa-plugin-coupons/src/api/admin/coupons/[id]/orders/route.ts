import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../../lib/coupons/api/utils"
import { couponOrders } from "../../../../../lib/coupons/server/admin"

/** `GET /admin/coupons/:id/orders` — orders that used the coupon, newest first, with the discount it gave. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  res.json({ orders: await couponOrders(req.scope, req.params.id) })
}
