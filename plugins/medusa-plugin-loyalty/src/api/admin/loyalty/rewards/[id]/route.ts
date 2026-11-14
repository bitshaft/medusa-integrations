import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { notFound, requireEnabled } from "../../../../../lib/loyalty/api/utils"
import type { AdminReward } from "../../../../../lib/loyalty/api/validators"

/** `POST /admin/loyalty/rewards/:id` — edits a reward. Redemptions already made keep what they got. */
export async function POST(req: MedusaRequest<AdminReward>, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const [current] = await service.listLoyaltyRewards({ id: req.params.id })
  if (!current) throw notFound(`Reward ${req.params.id}`)
  const reward = await service.updateLoyaltyRewards({ id: req.params.id, ...req.validatedBody } as never)
  res.json({ reward })
}

/** `DELETE /admin/loyalty/rewards/:id` — only for rewards nobody redeemed; switch others off instead. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const [current] = await service.listLoyaltyRewards({ id: req.params.id })
  if (!current) throw notFound(`Reward ${req.params.id}`)
  const used = await service.listLoyaltyRedemptions({ reward_id: req.params.id }, { take: 1 })
  if (used.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This reward has been redeemed, so it stays in the history. Switch it off instead of deleting it."
    )
  }
  await service.deleteLoyaltyRewards(req.params.id)
  res.json({ id: req.params.id, object: "loyalty_reward", deleted: true })
}
