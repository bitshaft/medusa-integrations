import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { customerId, requestLocale, requireEnabled } from "../../../../lib/loyalty/api/utils"
import { customerTexts } from "../../../../lib/loyalty/texts"
import { memberSummary } from "../../../../lib/loyalty/server/views"

/** `GET /store/loyalty/me` — balance, tier, points to the next tier, expiry date, and ready-made texts. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  const summary = await memberSummary(req.scope, customerId(req))
  const locale = await requestLocale(req, req.query.locale as string | undefined)
  res.json({
    ...summary,
    texts: customerTexts(
      {
        order_points: 0,
        balance: summary.balance,
        tier_name: summary.tier?.name ?? null,
        next_tier: summary.next_tier ? { name: summary.next_tier.name, remaining: summary.next_tier.remaining } : null,
        expires_at: summary.expires_at,
        currency_code: summary.currency_code,
        time_zone: summary.time_zone,
      },
      locale
    ),
  })
}
