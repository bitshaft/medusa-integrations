import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../../lib/coupons/api/utils"
import { duplicateCoupon } from "../../../../../lib/coupons/server/admin"

/** `POST /admin/coupons/:id/duplicate` — a paused copy with a free code (e.g. `JESIEN15-2`), to review and resume. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  const { id } = await duplicateCoupon(req.scope, req.params.id)
  res.status(201).json({ id })
}
