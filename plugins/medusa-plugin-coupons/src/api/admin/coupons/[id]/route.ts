import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { parseBody, requireEnabled } from "../../../../lib/coupons/api/utils"
import { AdminCreateCoupon } from "../../../../lib/coupons/api/validators"
import { couponDetail, deleteCoupon, updateCoupon } from "../../../../lib/coupons/server/admin"
import type { CouponDraft } from "../../../../lib/coupons/types"

/** `GET /admin/coupons/:id` — one coupon with its sentence, usage and stats. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  res.json({ coupon: await couponDetail(req.scope, req.params.id) })
}

/**
 * `POST /admin/coupons/:id` — edits a coupon in place; its promotions keep
 * their usage counts. The code, the kind, automatic or not and the number
 * of tiers cannot change (duplicate instead).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  const { draft, name } = parseBody(AdminCreateCoupon, req.body)
  await updateCoupon(req.scope, req.params.id, { draft: draft as CouponDraft, name })
  res.json({ coupon: await couponDetail(req.scope, req.params.id) })
}

/** `DELETE /admin/coupons/:id` — removes the coupon and its promotions; past orders keep their discounts. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  await deleteCoupon(req.scope, req.params.id)
  res.json({ id: req.params.id, object: "coupon", deleted: true })
}
