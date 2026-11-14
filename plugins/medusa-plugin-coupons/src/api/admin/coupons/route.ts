import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../lib/coupons/api/utils"
import type { AdminCreateCoupon } from "../../../lib/coupons/api/validators"
import { createCoupon, dashboard } from "../../../lib/coupons/server/admin"
import { type CouponFilter, countRows, rowMatchesFilter } from "../../../lib/coupons/status"
import type { CouponDraft } from "../../../lib/coupons/types"

/**
 * `GET /admin/coupons?filter=active&q=JESIEN` — the panel: cards, filter
 * counters and the coupon list (newest first) with usage and order stats.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  const { filter = "all", q } = req.validatedQuery as { filter?: CouponFilter; q?: string }
  const { coupons, cards } = await dashboard(req.scope)
  const search = q?.trim().toUpperCase()
  const list = coupons.filter(
    (view) =>
      rowMatchesFilter(view, filter) &&
      (!search || view.code.includes(search) || (view.name ?? "").toUpperCase().includes(search))
  )
  res.json({ coupons: list, counts: countRows(coupons), cards })
}

/** `POST /admin/coupons` — creates a coupon from the wizard. */
export async function POST(req: MedusaRequest<AdminCreateCoupon>, res: MedusaResponse) {
  await requireEnabled(req)
  const { draft, name } = req.validatedBody
  const { id } = await createCoupon(req.scope, { draft: draft as CouponDraft, name })
  res.status(201).json({ id })
}
