import { updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"

import { validateGiftQuantity } from "../../lib/loyalty/server/hooks"

/**
 * Medusa allows one handler per workflow hook. An app that already handles
 * `updateLineItemInCartWorkflow.hooks.validate` sets
 * `LOYALTY_DISABLE_HOOKS=line-item` and calls `validateGiftQuantity` from its own.
 */
const disabled = (process.env.LOYALTY_DISABLE_HOOKS ?? "").split(",").map((v) => v.trim())

if (!disabled.includes("line-item")) {
  updateLineItemInCartWorkflow.hooks.validate(async (input) => {
    validateGiftQuantity(input as Parameters<typeof validateGiftQuantity>[0])
  })
}
