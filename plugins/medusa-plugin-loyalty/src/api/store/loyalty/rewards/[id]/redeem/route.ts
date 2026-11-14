import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { customerId, requireEnabled } from "../../../../../../lib/loyalty/api/utils"
import type { StoreRedeem } from "../../../../../../lib/loyalty/api/validators"
import { graph } from "../../../../../../lib/loyalty/server/runtime"
import { redeemReward } from "../../../../../../lib/loyalty/server/rewards"

/**
 * `POST /store/loyalty/rewards/:id/redeem` with `{ cart_id }` for gifts.
 * A code reward returns `{ code, expires_at }`, ready for
 * `POST /store/carts/:id/promotions`; a gift returns the updated cart.
 */
export async function POST(req: MedusaRequest<StoreRedeem>, res: MedusaResponse) {
  await requireEnabled(req)
  const result = await redeemReward(req.scope, {
    customer_id: customerId(req),
    reward_id: req.params.id,
    cart_id: req.validatedBody.cart_id,
  })
  if (result.kind === "code") {
    res.json({
      type: "code",
      redemption_id: result.redemption_id,
      balance: result.balance,
      code: result.code,
      expires_at: result.expires_at,
    })
    return
  }
  const { data } = await graph(req.scope)({
    entity: "cart",
    fields: ["id", "total", "item_total", "items.*"],
    filters: { id: result.cart_id },
  })
  res.json({ type: "gift", redemption_id: result.redemption_id, balance: result.balance, cart: data[0] })
}
