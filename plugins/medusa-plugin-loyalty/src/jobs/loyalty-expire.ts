import type { MedusaContainer } from "@medusajs/framework/types"

import { expireRewardCodes, releaseAbandonedGifts } from "../lib/loyalty/server/rewards"
import { expirePoints } from "../lib/loyalty/server/maintenance"
import { logger, resolveLoyalty } from "../lib/loyalty/server/runtime"

/**
 * Daily: reward codes past their date (points back when the setting says
 * so), gifts in abandoned carts, then expiring balances and reminders.
 */
export default async function loyaltyExpire(container: MedusaContainer) {
  const service = resolveLoyalty(container)
  if (!(await service.isEnabled())) return
  const settings = await service.getSettings()
  const now = new Date()
  const codes = await expireRewardCodes(container, settings, now)
  const gifts = await releaseAbandonedGifts(container, settings, now)
  const points = await expirePoints(container, settings, now)
  logger(container).info(
    `[loyalty] Daily expiry: ${codes} code(s), ${gifts} gift(s) released, ${points.expired} balance(s) expired, ${points.reminded} reminder(s)`
  )
}

export const config = { name: "loyalty-expire", schedule: "10 3 * * *" }
