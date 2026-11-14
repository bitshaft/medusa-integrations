import type { MedusaContainer } from "@medusajs/framework/types"

import { addMonths, nextTier, tierFor } from "../points"
import { type LoyaltySettings, sortedTiers } from "../settings"
import { spendSince } from "../spend"
import type { Tier } from "../types"
import { emit, LoyaltyEvents, resolveLoyalty } from "./runtime"

/** Spend in the tier window, from the ledger. */
export async function spendOf(container: MedusaContainer, customerId: string, settings: LoyaltySettings, now: Date) {
  const since = addMonths(now, -settings.tiers.window_months)
  const entries = await resolveLoyalty(container).listLoyaltyEntries(
    { customer_id: customerId, reason: ["earn", "return", "cancel"] },
    { select: ["reason", "order_id", "created_at", "metadata"] }
  )
  return spendSince(entries as never, since)
}

export function tierById(settings: LoyaltySettings, id: string | null | undefined): Tier | null {
  return settings.tiers.levels.find((tier) => tier.id === id) ?? null
}

/** The multiplier of the customer's current tier (1 without tiers). */
export function multiplierOf(settings: LoyaltySettings, tierId: string | null | undefined): number {
  return tierById(settings, tierId)?.multiplier ?? 1
}

export type TierStatus = { tier: Tier | null; spend: number; next: { tier: Tier; remaining: number } | null }

export async function tierStatus(
  container: MedusaContainer,
  customerId: string,
  settings: LoyaltySettings,
  now: Date
): Promise<TierStatus> {
  const spend = await spendOf(container, customerId, settings, now)
  const tiers = sortedTiers(settings)
  return { tier: tierFor(spend, tiers), spend, next: nextTier(spend, tiers) }
}

/**
 * Puts the customer in the tier their spend reaches. A change is written to
 * the tier history and emits `loyalty.tier_changed`; the first time a
 * customer reaches a tier with a bonus, the bonus is added (once per tier).
 */
export async function recomputeTier(
  container: MedusaContainer,
  customerId: string,
  settings: LoyaltySettings,
  now: Date,
  trigger: string
): Promise<{ changed: boolean; tier: Tier | null }> {
  const service = resolveLoyalty(container)
  const { tier, spend } = await tierStatus(container, customerId, settings, now)
  const next = tier?.id ?? null
  const { from: current, changed } = await service.swapTier(customerId, next)
  if (!changed) return { changed: false, tier }

  await service.createLoyaltyTierChanges({
    customer_id: customerId,
    from_tier_id: current,
    to_tier_id: next,
    spend,
    trigger,
  })
  const from = tierById(settings, current)
  const up = (tier?.threshold ?? -1) > (from?.threshold ?? -1)
  await emit(container, LoyaltyEvents.TIER_CHANGED, {
    customer_id: customerId,
    from_tier: from ? { id: from.id, name: from.name } : null,
    to_tier: tier ? { id: tier.id, name: tier.name } : null,
    direction: up ? "up" : "down",
    spend,
  })
  if (up && tier && tier.bonus_points > 0) {
    const result = await service.post(customerId, [
      {
        key: `tier_bonus:${customerId}:${tier.id}`,
        type: "tier_bonus",
        reason: "tier_bonus",
        points: tier.bonus_points,
        description: tier.name,
      },
    ])
    if (result.created.length) {
      await emit(container, LoyaltyEvents.POINTS_EARNED, {
        customer_id: customerId,
        points: tier.bonus_points,
        reason: "tier_bonus",
        balance: result.balance,
        tier_id: tier.id,
      })
    }
  }
  return { changed: true, tier }
}
