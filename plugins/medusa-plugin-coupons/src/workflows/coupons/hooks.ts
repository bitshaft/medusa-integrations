import { completeCartWorkflow, updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"

import { couponsPromotionContext, validateCartPromotions, validateCompleteCart } from "../../lib/coupons/server/hooks"

/**
 * Medusa allows one handler per workflow hook. An app that already handles
 * one of these hooks sets `COUPONS_DISABLE_HOOKS=complete-cart` (or
 * `cart-promotions`, or both, comma separated) and calls the exported
 * handler from its own; see the README.
 */
const disabled = new Set(
  (process.env.COUPONS_DISABLE_HOOKS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
)

if (!disabled.has("cart-promotions")) {
  updateCartPromotionsWorkflow.hooks.validate(async (input, context) => {
    await validateCartPromotions(input as Parameters<typeof validateCartPromotions>[0], context)
  })
  updateCartPromotionsWorkflow.hooks.setPromotionContext(async (input, context) => {
    const result = await couponsPromotionContext(input as Parameters<typeof couponsPromotionContext>[0], context)
    return new StepResponse(result)
  })
}

if (!disabled.has("complete-cart")) {
  completeCartWorkflow.hooks.validate(async (input, context) => {
    await validateCompleteCart(input as Parameters<typeof validateCompleteCart>[0], context)
  })
}
