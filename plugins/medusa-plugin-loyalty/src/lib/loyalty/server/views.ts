import type { MedusaContainer } from "@medusajs/framework/types"

import { LoyaltyError } from "../messages"
import { currencyFactor, earnedPoints, expiresAt, orderBase, pointValue } from "../points"
import { type LoyaltySettings, sortedTiers } from "../settings"
import { customerTexts } from "../texts"
import type { Locale } from "../types"
import { GIFT_METADATA_KEY } from "./orders"
import { graph, type Membership, membership, resolveLoyalty, programCurrency } from "./runtime"
import { snapshot, tierAllows } from "./rewards"
import { multiplierOf, tierById, tierStatus } from "./tiers"

const tierInfo = (tier: { id: string; name: string; threshold: number; multiplier: number } | null) =>
  tier ? { id: tier.id, name: tier.name, threshold: tier.threshold, multiplier: tier.multiplier } : null

/** Everything a customer's loyalty screen shows: balance, tier, next tier, expiry. */
export async function memberSummary(container: MedusaContainer, customerId: string, now = new Date()) {
  const service = resolveLoyalty(container)
  const [settings, options] = await Promise.all([service.getSettings(), service.getOptions()])
  const member: Membership = await membership(container, customerId, settings.excluded_group_ids)
  const account = await service.getAccount(customerId)
  const balance = await service.balanceOf(customerId)
  const status = await tierStatus(container, customerId, settings, now)
  const since = account?.last_activity_at ?? account?.created_at ?? null
  const expires = balance > 0 ? expiresAt(since, settings.expiry) : null
  return {
    customer_id: customerId,
    program_enabled: settings.enabled,
    member: member.member,
    not_member_reason: member.member ? null : member.reason,
    balance,
    tier: tierInfo(tierById(settings, account?.tier_id) ?? null),
    spend: status.spend,
    next_tier: status.next ? { ...tierInfo(status.next.tier)!, remaining: status.next.remaining } : null,
    expires_at: expires?.toISOString() ?? null,
    last_activity_at: account?.last_activity_at?.toISOString() ?? null,
    birthday: account?.birthday ?? null,
    currency_code: await programCurrency(container, settings),
    terms_url: settings.terms_url,
    time_zone: options.timeZone,
  }
}

/** Active rewards, and for a customer whether they can redeem each now (and why not). */
export async function rewardCatalog(container: MedusaContainer, customerId: string | null) {
  const service = resolveLoyalty(container)
  const settings = await service.getSettings()
  const rewards = (await service.listLoyaltyRewards({ active: true }, { order: { cost: "ASC" } })).map(snapshot)
  let balance = 0
  let tierId: string | null = null
  let used: Record<string, number> = {}
  let member = false
  if (customerId) {
    member = (await membership(container, customerId, settings.excluded_group_ids)).member
    balance = await service.balanceOf(customerId)
    tierId = (await service.getAccount(customerId))?.tier_id ?? null
    const redemptions = await service.listLoyaltyRedemptions(
      { customer_id: customerId, status: { $ne: "released" } },
      { select: ["reward_id"] }
    )
    used = redemptions.reduce<Record<string, number>>(
      (acc, r) => ({ ...acc, [r.reward_id]: (acc[r.reward_id] ?? 0) + 1 }),
      {}
    )
  }
  return rewards.map((reward) => {
    const tierOk = tierAllows(settings, tierId, reward.min_tier_id)
    const limitLeft =
      reward.per_customer_limit == null ? null : Math.max(0, reward.per_customer_limit - (used[reward.id] ?? 0))
    const blocked = !settings.enabled
      ? "program_disabled"
      : !customerId
        ? "not_signed_in"
        : !member
          ? "excluded"
          : balance < 0
            ? "negative_balance"
            : !tierOk
              ? "tier_too_low"
              : limitLeft === 0
                ? "limit_reached"
                : balance < reward.cost
                  ? "insufficient_points"
                  : null
    return {
      id: reward.id,
      name: reward.name,
      description: reward.description,
      kind: reward.kind,
      value: reward.value,
      currency_code: reward.currency_code,
      cost: reward.cost,
      variant_id: reward.variant_id,
      code_valid_days: reward.code_valid_days,
      min_tier: tierInfo(tierById(settings, reward.min_tier_id)),
      limit_left: limitLeft,
      affordable: balance >= reward.cost && balance >= 0,
      can_redeem: blocked == null,
      blocked_reason: blocked,
      points_missing: Math.max(0, reward.cost - Math.max(0, balance)),
    }
  })
}

/** Points an amount or a cart would earn, with the customer's tier multiplier when signed in. */
export async function estimate(
  container: MedusaContainer,
  input: { amount?: number; currency_code?: string; cart_id?: string; customer_id?: string | null },
  locale: Locale
) {
  const service = resolveLoyalty(container)
  const [settings, options] = await Promise.all([service.getSettings(), service.getOptions()])
  const currency = await programCurrency(container, settings)
  let base = 0
  let amountCurrency = input.currency_code ?? currency
  if (input.cart_id) {
    const { data } = await graph(container)({
      entity: "cart",
      fields: [
        "id",
        "customer_id",
        "currency_code",
        "items.id",
        "items.quantity",
        "items.total",
        "items.tax_total",
        "items.metadata",
      ],
      filters: { id: input.cart_id },
    })
    // A customer's cart is theirs alone; guest carts stay readable, as in Medusa's own cart route.
    if (data[0]?.customer_id && data[0].customer_id !== input.customer_id) throw new LoyaltyError("cart_not_yours")
    const lines = ((data[0]?.items ?? []) as Array<Record<string, any> | null>).filter(Boolean).map((item) => ({
      id: item!.id,
      quantity: Number(item!.quantity ?? 0),
      total: Number(item!.total ?? 0),
      tax_total: Number(item!.tax_total ?? 0),
      is_reward: !!item!.metadata?.[GIFT_METADATA_KEY],
    }))
    base = orderBase(lines, settings.earn.base).total
    amountCurrency = data[0]?.currency_code ?? currency
  } else {
    base = Math.max(0, input.amount ?? 0)
  }
  // The same conversion as for orders; a currency without a rate earns nothing.
  const factor = currencyFactor(amountCurrency, currency, settings.currency_rates)
  base = factor === null ? 0 : Math.round(base * factor * 100) / 100
  let multiplier = 1
  let member = !!input.customer_id
  if (input.customer_id) {
    member = (await membership(container, input.customer_id, settings.excluded_group_ids)).member
    multiplier = multiplierOf(settings, (await service.getAccount(input.customer_id))?.tier_id)
  }
  const points = settings.enabled && (member || !input.customer_id) ? earnedPoints(base, settings.earn, multiplier) : 0
  return {
    points,
    base,
    multiplier,
    signed_in: !!input.customer_id,
    message:
      points > 0
        ? customerTexts(
            {
              order_points: points,
              balance: 0,
              tier_name: null,
              next_tier: null,
              expires_at: null,
              currency_code: currency,
              time_zone: options.timeZone,
            },
            locale
          ).order
        : null,
  }
}

/** The admin panel's numbers. */
export async function dashboardStats(container: MedusaContainer, now = new Date()) {
  const service = resolveLoyalty(container)
  const settings: LoyaltySettings = await service.getSettings()
  const since = new Date(now.getTime() - 30 * 86_400_000)
  const [totals, accounts, rewardCounts, rewards, members] = await Promise.all([
    service.ledgerTotals(since),
    service.accountTotals(),
    service.rewardTotals(),
    service.listLoyaltyRewards({}),
    graph(container)({ entity: "customer", fields: ["id"], filters: { has_account: true }, pagination: { take: 1 } }),
  ])
  const value = pointValue(rewards.map(snapshot))

  // Points that expire within 30 days, from accounts with a positive balance.
  let expiring = 0
  if (settings.expiry.enabled) {
    const soon = now.getTime() + 30 * 86_400_000
    for (let skip = 0; ; skip += 500) {
      const page = await service.listLoyaltyAccounts({ balance: { $gt: 0 } }, { take: 500, skip, order: { id: "ASC" } })
      for (const account of page) {
        const at = expiresAt(new Date(account.last_activity_at ?? account.created_at), settings.expiry)
        if (at && at.getTime() <= soon) expiring += Number(account.balance)
      }
      if (page.length < 500) break
    }
  }

  const earned = Object.entries(totals)
    .filter(([reason]) => ["earn", "signup", "first_order", "birthday", "newsletter", "tier_bonus"].includes(reason))
    .reduce((sum, [, points]) => sum + points, 0)
  const redeemed = -(totals.redeem ?? 0) - (totals.redeem_returned ?? 0)
  return {
    members: members.metadata?.count ?? 0,
    earned_30d: earned,
    redeemed_30d: Math.max(0, redeemed),
    open_points: accounts.open_points,
    open_value: value != null ? Math.round(accounts.open_points * value * 100) / 100 : null,
    point_value: value,
    currency_code: await programCurrency(container, settings),
    tiers: [
      ...sortedTiers(settings).map((tier) => ({
        id: tier.id,
        name: tier.name,
        customers: accounts.tiers[tier.id] ?? 0,
      })),
      { id: null, name: null, customers: accounts.tiers[""] ?? 0 },
    ],
    top_rewards: rewards
      .map((r) => ({ id: r.id, name: r.name, kind: r.kind, redemptions: rewardCounts[r.id] ?? 0 }))
      .filter((r) => r.redemptions > 0)
      .sort((a, b) => b.redemptions - a.redemptions)
      .slice(0, 5),
    expiring_30d: expiring,
  }
}
