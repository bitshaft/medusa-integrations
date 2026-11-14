import { randomInt } from "node:crypto"

import type { IPromotionModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import type { RewardKind } from "../../lib/loyalty/types"
import { LOYALTY_MODULE } from "../../modules/loyalty"
import type LoyaltyModuleService from "../../modules/loyalty/service"

type Container = { resolve: <T>(key: string) => T }
const loyalty = (container: Container) => container.resolve<LoyaltyModuleService>(LOYALTY_MODULE)
const promotions = (container: Container) => container.resolve<IPromotionModuleService>(Modules.PROMOTION)

export type RewardSnapshot = {
  id: string
  name: string
  kind: RewardKind
  cost: number
  value: number | null
  currency_code: string | null
  per_customer_limit: number | null
  code_valid_days: number | null
  variant_id: string | null
}

/**
 * Spends the points and records the redemption, under the account lock.
 * If a later step fails, the points come back with a correcting entry
 * (the ledger is never edited).
 */
export const loyaltyDebitStep = createStep(
  "loyalty-debit",
  async (
    input: {
      customer_id: string
      reward: RewardSnapshot
      status: "issued" | "in_cart"
      cart_id?: string | null
      now: Date
    },
    { container }
  ) => {
    const { redemption, balance } = await loyalty(container).redeem({
      customer_id: input.customer_id,
      reward: input.reward,
      status: input.status,
      cart_id: input.cart_id ?? null,
      variant_id: input.reward.variant_id,
      now: input.now,
    })
    return new StepResponse({ redemption, balance }, redemption.id)
  },
  async (redemptionId, { container }) => {
    if (!redemptionId) return
    await loyalty(container).returnRedemption(redemptionId, "released", {
      description: "Redemption failed",
      from: ["issued", "in_cart"],
    })
  }
)

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const rewardCode = () =>
  `LOY-${Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`

/** The Promotion Module record of a reward code: one use, this customer only, until `ends_at`. */
export function rewardPromotion(input: {
  code: string
  customer_id: string
  redemption_id: string
  reward: RewardSnapshot
}) {
  const method =
    input.reward.kind === "free_shipping"
      ? { type: "percentage", target_type: "shipping_methods", allocation: "across", value: 100 }
      : input.reward.kind === "percentage"
        ? { type: "percentage", target_type: "items", allocation: "across", value: input.reward.value ?? 0 }
        : {
            type: "fixed",
            target_type: "items",
            allocation: "across",
            value: input.reward.value ?? 0,
            currency_code: input.reward.currency_code ?? "pln",
          }
  return {
    code: input.code,
    type: "standard" as const,
    status: "active" as const,
    is_automatic: false,
    is_tax_inclusive: true,
    limit: 1,
    rules: [{ attribute: "customer.id", operator: "eq" as const, values: [input.customer_id] }],
    application_method: method,
    metadata: { loyalty_redemption_id: input.redemption_id, loyalty_reward_id: input.reward.id },
  }
}

/** Creates the one-off code (with its campaign carrying the end date). */
export const loyaltyCreateCodeStep = createStep(
  "loyalty-create-code",
  async (input: { customer_id: string; redemption_id: string; reward: RewardSnapshot; now: Date }, { container }) => {
    const service = promotions(container)
    const days = input.reward.code_valid_days
    const ends_at = days ? new Date(input.now.getTime() + days * 86_400_000) : null
    const campaign = await service.createCampaigns({
      name: `Loyalty reward ${input.redemption_id}`,
      campaign_identifier: `loyalty-${input.redemption_id}`,
      starts_at: input.now,
      ends_at,
    })
    // A collision is practically impossible (31^8), but retry rather than fail.
    let promotion: { id: string; code?: string | null } | null = null
    for (let attempt = 0; attempt < 5 && !promotion; attempt++) {
      const code = rewardCode()
      const taken = await service.listPromotions({ code: [code] }, { select: ["id"] })
      if (taken.length) continue
      const [created] = await service.createPromotions([
        {
          ...rewardPromotion({
            code,
            customer_id: input.customer_id,
            redemption_id: input.redemption_id,
            reward: input.reward,
          }),
          campaign_id: campaign.id,
        },
      ] as never)
      promotion = created
    }
    if (!promotion) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "[loyalty] Could not find a free code for the reward. Try again."
      )
    }
    return new StepResponse(
      { promotion_id: promotion.id, code: promotion.code!, expires_at: ends_at },
      { promotion_id: promotion.id, campaign_id: campaign.id }
    )
  },
  async (created, { container }) => {
    if (!created) return
    await promotions(container).deletePromotions([created.promotion_id])
    await promotions(container).deleteCampaigns([created.campaign_id])
  }
)

export const loyaltyRecordCodeStep = createStep(
  "loyalty-record-code",
  async (
    input: { redemption_id: string; promotion_id: string; code: string; expires_at: Date | null },
    { container }
  ) => {
    await loyalty(container).updateLoyaltyRedemptions({
      id: input.redemption_id,
      promotion_id: input.promotion_id,
      code: input.code,
      expires_at: input.expires_at,
    })
    return new StepResponse(undefined)
  }
)
