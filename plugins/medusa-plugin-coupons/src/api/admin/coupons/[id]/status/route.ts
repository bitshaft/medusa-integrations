import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../../lib/coupons/api/utils"
import type { AdminCouponStatus } from "../../../../../lib/coupons/api/validators"
import { couponDetail, setStatus } from "../../../../../lib/coupons/server/admin"

/** `POST /admin/coupons/:id/status` with `{ status: "paused" | "active" }` — pauses or resumes a coupon. */
export async function POST(req: MedusaRequest<AdminCouponStatus>, res: MedusaResponse) {
  await requireEnabled(req)
  await setStatus(req.scope, req.params.id, req.validatedBody.status)
  res.json({ coupon: await couponDetail(req.scope, req.params.id) })
}
