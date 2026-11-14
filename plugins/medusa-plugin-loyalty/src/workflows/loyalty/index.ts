import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import { GIFT_METADATA_KEY } from "../../lib/loyalty/server/orders"
import { loyaltyCreateCodeStep, loyaltyDebitStep, loyaltyRecordCodeStep, type RewardSnapshot } from "./steps"

export * from "./steps"

type RedeemInput = { customer_id: string; reward: RewardSnapshot; now: Date }

/**
 * Redeems a code reward (amount, percentage, free shipping): spends the
 * points, creates a one-off code in the Promotion Module for this customer
 * only, and records it. Undone step by step if anything fails.
 */
export const redeemLoyaltyCodeWorkflow = createWorkflow("redeem-loyalty-code", (input: RedeemInput) => {
  const debit = loyaltyDebitStep(transform({ input }, ({ input }) => ({ ...input, status: "issued" as const })))
  const code = loyaltyCreateCodeStep(
    transform({ input, debit }, ({ input, debit }) => ({
      customer_id: input.customer_id,
      redemption_id: debit.redemption.id,
      reward: input.reward,
      now: input.now,
    }))
  )
  loyaltyRecordCodeStep(
    transform({ debit, code }, ({ debit, code }) => ({ redemption_id: debit.redemption.id, ...code }))
  )
  return new WorkflowResponse(
    transform({ debit, code }, ({ debit, code }) => ({
      redemption_id: debit.redemption.id,
      balance: debit.balance,
      code: code.code,
      promotion_id: code.promotion_id,
      expires_at: code.expires_at,
    }))
  )
})

/**
 * Redeems a gift: spends the points and adds the variant to the cart at
 * 0, marked with the redemption id. Removing it from the cart before the
 * order gives the points back (the cart watcher does that).
 */
export const redeemLoyaltyGiftWorkflow = createWorkflow(
  "redeem-loyalty-gift",
  (input: RedeemInput & { cart_id: string }) => {
    const debit = loyaltyDebitStep(transform({ input }, ({ input }) => ({ ...input, status: "in_cart" as const })))
    addToCartWorkflow.runAsStep({
      input: transform({ input, debit }, ({ input, debit }) => ({
        cart_id: input.cart_id,
        items: [
          {
            variant_id: input.reward.variant_id!,
            quantity: 1,
            unit_price: 0,
            metadata: { [GIFT_METADATA_KEY]: debit.redemption.id, loyalty_reward_id: input.reward.id },
          },
        ],
      })),
    })
    return new WorkflowResponse(
      transform({ debit }, ({ debit }) => ({ redemption_id: debit.redemption.id, balance: debit.balance }))
    )
  }
)
