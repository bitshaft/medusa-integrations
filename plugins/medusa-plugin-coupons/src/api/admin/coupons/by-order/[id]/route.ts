import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../../lib/coupons/api/utils"
import { loadOrderCoupons } from "../../../../../lib/coupons/server/query"

/**
 * `GET /admin/coupons/by-order/:id` — the codes an order used, the discount
 * each gave, and the coupon of this plugin each belongs to (for the order
 * page's Integrations card).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  res.json(await loadOrderCoupons(req.scope, req.params.id))
}
