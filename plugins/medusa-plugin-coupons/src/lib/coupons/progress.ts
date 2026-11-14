import { pickTier, sortedTiers } from "./tiers"
import type { CouponKind, Tier } from "./types"

export type ProgressCoupon = {
  /** Code to show the customer; null for automatic coupons. */
  code: string | null
  kind: CouponKind
  tiers: Tier[] | null
  min_subtotal: number | null
}

export type TierProgress = {
  code: string | null
  kind: "percentage" | "fixed"
  levels: Array<Tier & { reached: boolean }>
  current: Tier | null
  next: (Tier & { remaining: number }) | null
}

export type CartProgress = {
  basket_total: number
  tiers: TierProgress[]
  free_shipping: { threshold: number; remaining: number; reached: boolean; code: string | null } | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * What the storefront shows next to the basket: the tier reached and how
 * much is missing to the next one, and how much is missing to free
 * shipping. Basket means gross items before discounts, as the rules use.
 */
export function cartProgress(basketTotal: number, coupons: ProgressCoupon[]): CartProgress {
  const tiers: TierProgress[] = []
  for (const coupon of coupons) {
    if (!coupon.tiers?.length || (coupon.kind !== "percentage" && coupon.kind !== "fixed")) continue
    const levels = sortedTiers(coupon.tiers)
    const floor = coupon.min_subtotal ?? 0
    const reachedAt = (tier: Tier) => basketTotal >= Math.max(tier.min, floor)
    const current = levels.some(reachedAt) ? pickTier(levels, basketTotal) : null
    const nextTier = levels.find((tier) => !reachedAt(tier)) ?? null
    tiers.push({
      code: coupon.code,
      kind: coupon.kind,
      levels: levels.map((tier) => ({ ...tier, reached: reachedAt(tier) })),
      current,
      next: nextTier ? { ...nextTier, remaining: round2(Math.max(nextTier.min, floor) - basketTotal) } : null,
    })
  }

  // The closest free shipping offer: the lowest threshold not reached yet, or one already reached.
  const shipping = coupons
    .filter((c) => c.kind === "free_shipping")
    .map((c) => ({ threshold: c.min_subtotal ?? 0, code: c.code }))
    .sort((a, b) => a.threshold - b.threshold)
  const reached = shipping.find((s) => basketTotal >= s.threshold)
  const pick = reached ?? shipping[0]
  const free_shipping = pick
    ? {
        threshold: pick.threshold,
        remaining: round2(Math.max(0, pick.threshold - basketTotal)),
        reached: basketTotal >= pick.threshold,
        code: pick.code,
      }
    : null

  return { basket_total: round2(basketTotal), tiers, free_shipping }
}
