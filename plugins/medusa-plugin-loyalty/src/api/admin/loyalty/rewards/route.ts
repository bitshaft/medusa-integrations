import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../lib/loyalty/api/utils"
import type { AdminReward } from "../../../../lib/loyalty/api/validators"

/** `GET /admin/loyalty/rewards` — the catalog with redemption counts. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const [rewards, counts] = await Promise.all([
    service.listLoyaltyRewards({}, { order: { created_at: "DESC" } }),
    service.rewardTotals(),
  ])
  res.json({
    rewards: rewards.map((r) => ({
      ...r,
      value: r.value != null ? Number(r.value) : null,
      redemptions: counts[r.id] ?? 0,
    })),
  })
}

/** `POST /admin/loyalty/rewards` — adds a reward. */
export async function POST(req: MedusaRequest<AdminReward>, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const settings = await service.getSettings()
  const body = req.validatedBody
  const reward = await service.createLoyaltyRewards({
    ...body,
    currency_code: body.currency_code ?? settings.currency_code,
  } as never)
  res.status(201).json({ reward })
}
