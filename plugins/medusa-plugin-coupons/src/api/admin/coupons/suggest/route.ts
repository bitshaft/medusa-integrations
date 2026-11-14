import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IPromotionModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import { requireEnabled } from "../../../../lib/coupons/api/utils"
import { codeCandidates, randomCode } from "../../../../lib/coupons/codes"
import { tierCode } from "../../../../lib/coupons/promotions"
import { loadCoupons } from "../../../../lib/coupons/server/query"
import { COUPON_KINDS, type CouponKind } from "../../../../lib/coupons/types"

/** `GET /admin/coupons/suggest?kind=percentage&value=15` — the "Suggest" button: a readable code no coupon uses yet. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  const kind = (COUPON_KINDS as readonly string[]).includes(String(req.query.kind))
    ? (req.query.kind as CouponKind)
    : "percentage"
  const value = req.query.value != null ? Number(req.query.value) : null
  const candidates = codeCandidates({ kind, value })

  const taken = new Set((await loadCoupons(req.scope)).map((c) => c.code))
  const used = await req.scope
    .resolve<IPromotionModuleService>(Modules.PROMOTION)
    .listPromotions({ code: candidates.flatMap((code) => [code, tierCode(code, 0)]) }, { select: ["code"] })
  for (const promotion of used) if (promotion.code) taken.add(promotion.code.replace(/__T1$/, ""))

  res.json({ code: candidates.find((code) => !taken.has(code)) ?? randomCode(8) })
}
