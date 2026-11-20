import type { IPromotionModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, getVariantAvailability, Modules } from "@medusajs/framework/utils"
import { deleteLineItemsWorkflow } from "@medusajs/medusa/core-flows"

import { redeemLoyaltyCodeWorkflow, redeemLoyaltyGiftWorkflow, type RewardSnapshot } from "../../../workflows/loyalty"
import { LoyaltyError } from "../messages"
import type { LoyaltySettings } from "../settings"
import { GIFT_METADATA_KEY } from "./orders"
import { emit, graph, LoyaltyEvents, membership, resolveLoyalty } from "./runtime"
import { tierById } from "./tiers"

export type RewardRow = RewardSnapshot & { description: string | null; active: boolean; min_tier_id: string | null }

export function snapshot(reward: Record<string, any>): RewardRow {
  return {
    id: reward.id,
    name: reward.name,
    description: reward.description ?? null,
    kind: reward.kind,
    cost: Number(reward.cost),
    value: reward.value != null ? Number(reward.value) : null,
    currency_code: reward.currency_code ?? null,
    per_customer_limit: reward.per_customer_limit ?? null,
    code_valid_days: reward.code_valid_days ?? null,
    variant_id: reward.variant_id ?? null,
    active: !!reward.active,
    min_tier_id: reward.min_tier_id ?? null,
  }
}

/** Whether the customer's tier is high enough for a reward. */
export function tierAllows(settings: LoyaltySettings, customerTier: string | null, minTier: string | null): boolean {
  if (!minTier) return true
  const required = tierById(settings, minTier)
  if (!required) return true
  const current = tierById(settings, customerTier)
  return (current?.threshold ?? -1) >= required.threshold
}

/** Units of a variant that can be sold in a sales channel; Infinity when stock is not tracked. */
async function availableUnits(
  container: MedusaContainer,
  variantId: string,
  salesChannelId: string | null
): Promise<number> {
  const { data } = await graph(container)({
    entity: "product_variant",
    fields: ["id", "manage_inventory", "allow_backorder", "product.status"],
    filters: { id: variantId },
  })
  const variant = data[0]
  if (!variant || variant.product?.status === "draft") return 0
  if (!variant.manage_inventory || variant.allow_backorder) return Number.POSITIVE_INFINITY
  if (!salesChannelId) return 0
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const availability = await getVariantAvailability(query as never, {
    variant_ids: [variantId],
    sales_channel_id: salesChannelId,
  })
  return Number(availability[variantId]?.availability ?? 0)
}

export type RedeemResult =
  | { kind: "code"; redemption_id: string; balance: number; code: string; expires_at: Date | null }
  | { kind: "gift"; redemption_id: string; balance: number; cart_id: string }

/**
 * Exchanges points for a reward, with every rule checked on the server:
 * program on, customer taking part, reward active, tier high enough,
 * balance (checked again under the account lock), per-customer limit,
 * and for gifts the customer's own open cart and stock.
 */
export async function redeemReward(
  container: MedusaContainer,
  input: { customer_id: string; reward_id: string; cart_id?: string | null },
  now = new Date()
): Promise<RedeemResult> {
  const service = resolveLoyalty(container)
  const settings = await service.getSettings()
  if (!settings.enabled) throw new LoyaltyError("program_disabled")
  const member = await membership(container, input.customer_id, settings.excluded_group_ids)
  if (!member.member) throw new LoyaltyError(member.reason === "excluded" ? "excluded" : "not_signed_in")

  const [row] = await service.listLoyaltyRewards({ id: input.reward_id })
  if (!row) throw new LoyaltyError("reward_not_found")
  const reward = snapshot(row)
  if (!reward.active) throw new LoyaltyError("reward_inactive")
  const account = await service.getAccount(input.customer_id)
  if (!tierAllows(settings, account?.tier_id ?? null, reward.min_tier_id)) {
    throw new LoyaltyError("tier_too_low", { tier: tierById(settings, reward.min_tier_id)?.name ?? "" })
  }

  if (reward.kind === "gift") {
    if (!input.cart_id) throw new LoyaltyError("cart_required")
    const { data } = await graph(container)({
      entity: "cart",
      fields: ["id", "customer_id", "completed_at", "sales_channel_id"],
      filters: { id: input.cart_id },
    })
    const cart = data[0]
    if (!cart) throw new LoyaltyError("cart_not_found")
    if (cart.customer_id !== input.customer_id) throw new LoyaltyError("cart_not_yours")
    if (cart.completed_at) throw new LoyaltyError("cart_completed")
    if ((await availableUnits(container, reward.variant_id!, cart.sales_channel_id ?? null)) < 1) {
      throw new LoyaltyError("out_of_stock")
    }
    const { result } = await redeemLoyaltyGiftWorkflow(container).run({
      input: { customer_id: input.customer_id, reward, now, cart_id: cart.id },
    })
    await announce(container, input.customer_id, reward, result.redemption_id, result.balance, { cart_id: cart.id })
    return { kind: "gift", redemption_id: result.redemption_id, balance: result.balance, cart_id: cart.id }
  }

  const { result } = await redeemLoyaltyCodeWorkflow(container).run({
    input: { customer_id: input.customer_id, reward, now },
  })
  await announce(container, input.customer_id, reward, result.redemption_id, result.balance, {
    code: result.code,
    expires_at: result.expires_at,
  })
  return {
    kind: "code",
    redemption_id: result.redemption_id,
    balance: result.balance,
    code: result.code,
    expires_at: result.expires_at,
  }
}

async function announce(
  container: MedusaContainer,
  customerId: string,
  reward: RewardSnapshot,
  redemptionId: string,
  balance: number,
  extra: Record<string, unknown>
) {
  await emit(container, LoyaltyEvents.POINTS_REDEEMED, {
    customer_id: customerId,
    points: -reward.cost,
    balance,
    redemption_id: redemptionId,
    reward_id: reward.id,
  })
  await emit(container, LoyaltyEvents.REWARD_REDEEMED, {
    customer_id: customerId,
    redemption_id: redemptionId,
    reward_id: reward.id,
    reward_name: reward.name,
    kind: reward.kind,
    cost: reward.cost,
    ...extra,
  })
}

/**
 * After a cart changes: a gift whose line is gone was removed before the
 * order, so its points come back (once). Carts that became orders are left
 * to `order.placed`.
 */
export async function syncCartGifts(container: MedusaContainer, cartId: string): Promise<number> {
  const service = resolveLoyalty(container)
  if (!(await service.isEnabled())) return 0
  const gifts = await service.listLoyaltyRedemptions({ cart_id: cartId, status: "in_cart" })
  if (!gifts.length) return 0
  const { data } = await graph(container)({
    entity: "cart",
    fields: ["id", "completed_at", "items.metadata"],
    filters: { id: cartId },
  })
  const cart = data[0]
  if (cart?.completed_at) return 0
  const present = new Set(
    ((cart?.items ?? []) as Array<Record<string, any> | null>)
      .map((item) => item?.metadata?.[GIFT_METADATA_KEY])
      .filter(Boolean)
  )
  let released = 0
  for (const gift of gifts) {
    if (present.has(gift.id)) continue
    const back = await service.returnRedemption(gift.id, "released", { description: "Gift removed from the cart" })
    if (back.changed) {
      released++
      await emit(container, LoyaltyEvents.POINTS_REVERTED, {
        customer_id: gift.customer_id,
        points: gift.cost,
        reason: "gift_removed",
        redemption_id: gift.id,
        cart_id: cartId,
      })
    }
  }
  return released
}

/** Gifts left in carts that never became orders: removed from the cart and refunded after `gift_release_days`. */
export async function releaseAbandonedGifts(container: MedusaContainer, settings: LoyaltySettings, now = new Date()) {
  const service = resolveLoyalty(container)
  const before = new Date(now.getTime() - settings.rewards.gift_release_days * 86_400_000)
  const gifts = await service.listLoyaltyRedemptions({ status: "in_cart", created_at: { $lt: before } })
  let released = 0
  for (const gift of gifts) {
    if (!gift.cart_id) continue
    const { data } = await graph(container)({
      entity: "cart",
      fields: ["id", "completed_at", "items.id", "items.metadata"],
      filters: { id: gift.cart_id },
    })
    const cart = data[0]
    if (cart?.completed_at) continue
    const lines = ((cart?.items ?? []) as Array<Record<string, any> | null>)
      .filter((item) => item?.metadata?.[GIFT_METADATA_KEY] === gift.id)
      .map((item) => item!.id as string)
    if (lines.length) await deleteLineItemsWorkflow(container).run({ input: { cart_id: gift.cart_id, ids: lines } })
    const back = await service.returnRedemption(gift.id, "released", { description: "Cart abandoned" })
    if (back.changed) {
      released++
      await emit(container, LoyaltyEvents.POINTS_REVERTED, {
        customer_id: gift.customer_id,
        points: gift.cost,
        reason: "gift_cart_abandoned",
        redemption_id: gift.id,
        cart_id: gift.cart_id,
      })
    }
  }
  return released
}

/**
 * Reward codes past their end date and never used: closed, their
 * promotion switched off, and the points given back when the setting says so.
 */
export async function expireRewardCodes(container: MedusaContainer, settings: LoyaltySettings, now = new Date()) {
  const service = resolveLoyalty(container)
  const due = await service.listLoyaltyRedemptions({ status: "issued", expires_at: { $lte: now } })
  const refund = settings.rewards.return_points_on_code_expiry
  let expired = 0
  for (const redemption of due) {
    // The code is switched off first: if closing then fails, the next run
    // closes it, and a closed redemption never leaves a live code behind.
    if (redemption.promotion_id) {
      await container
        .resolve<IPromotionModuleService>(Modules.PROMOTION)
        .updatePromotions([{ id: redemption.promotion_id, status: "inactive" }])
    }
    const closed = await service.returnRedemption(redemption.id, "expired", {
      description: "Code expired unused",
      refund,
    })
    if (!closed.changed) continue
    expired++
    if (refund) {
      await emit(container, LoyaltyEvents.POINTS_REVERTED, {
        customer_id: redemption.customer_id,
        points: redemption.cost,
        reason: "code_expired",
        redemption_id: redemption.id,
        code: redemption.code,
      })
    }
  }
  return expired
}
