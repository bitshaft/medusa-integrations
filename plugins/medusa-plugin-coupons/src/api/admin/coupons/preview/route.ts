import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../lib/coupons/api/utils"
import type { AdminPreviewCoupon } from "../../../../lib/coupons/api/validators"
import { previewDraft } from "../../../../lib/coupons/server/admin"
import type { CouponDraft } from "../../../../lib/coupons/types"

/**
 * `POST /admin/coupons/preview` — the wizard's right-hand panel: the
 * sentence in both languages, errors that block saving and warnings to read
 * first (overlap, code taken, 100% discount, automatic with no conditions).
 * Saves nothing. Pass `id` when editing, so the coupon is not compared with itself.
 */
export async function POST(req: MedusaRequest<AdminPreviewCoupon>, res: MedusaResponse) {
  await requireEnabled(req)
  const { draft, id } = req.validatedBody
  const { report, sentence } = await previewDraft(req.scope, { draft: draft as CouponDraft, id })
  res.json({ errors: report.errors, warnings: report.warnings, sentence })
}
