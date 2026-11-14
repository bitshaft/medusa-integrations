import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../../lib/loyalty/api/utils"
import { memberSummary } from "../../../../../lib/loyalty/server/views"

/** `GET /admin/loyalty/customers/:id` — balance, tier, next tier, expiry, tier history and redemptions. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const id = req.params.id
  const [summary, tierChanges, redemptions] = await Promise.all([
    memberSummary(req.scope, id),
    service.listLoyaltyTierChanges({ customer_id: id }, { order: { created_at: "DESC" }, take: 50 }),
    service.listLoyaltyRedemptions({ customer_id: id }, { order: { created_at: "DESC" }, take: 50 }),
  ])
  res.json({
    summary,
    tier_changes: tierChanges.map((t) => ({ ...t, spend: Number(t.spend) })),
    redemptions,
  })
}
