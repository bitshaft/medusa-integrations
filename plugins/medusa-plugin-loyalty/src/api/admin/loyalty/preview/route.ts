import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../lib/loyalty/api/utils"
import type { AdminPreview } from "../../../../lib/loyalty/api/validators"
import { addMonths, earnedPoints, nextTier } from "../../../../lib/loyalty/points"
import { sortedTiers } from "../../../../lib/loyalty/settings"
import { customerTexts } from "../../../../lib/loyalty/texts"

/**
 * `POST /admin/loyalty/preview` — "What the customer sees": the texts for a
 * sample basket, balance and tier, with the saved settings, in both languages.
 */
export async function POST(req: MedusaRequest<AdminPreview>, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const [settings, options] = await Promise.all([service.getSettings(), service.getOptions()])
  const { amount, tier_id, balance } = req.validatedBody
  const tiers = sortedTiers(settings)
  const tier = tiers.find((t) => t.id === tier_id) ?? null
  const points = earnedPoints(amount, settings.earn, tier?.multiplier ?? 1)
  const next = nextTier(tier?.threshold ?? 0, tiers)
  const input = {
    order_points: points,
    balance,
    tier_name: tier?.name ?? null,
    next_tier: next ? { name: next.tier.name, remaining: next.remaining } : null,
    expires_at: settings.expiry.enabled ? addMonths(new Date(), settings.expiry.months) : null,
    currency_code: settings.currency_code,
    time_zone: options.timeZone,
  }
  res.json({ points, texts: { pl: customerTexts(input, "pl"), en: customerTexts(input, "en") } })
}
