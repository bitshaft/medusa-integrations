import type { MedusaContainer } from "@medusajs/framework/types"

import { appliedGroups, CART_METADATA_KEY, type KnownPromotion } from "../context"
import { normalizeCode } from "../format"
import { evaluatePolicy, type PolicyReason, policyMessage } from "../policy"
import type { CouponDraft } from "../types"
import {
  type CouponWithPromotions,
  loadCoupons,
  loadCustomerGroupIds,
  loadCustomerOrders,
  loadKnownPromotions,
  loadTierGroups,
  type PromotionRecord,
} from "./query"

/** The cart fields the checks read. Matches what Medusa's cart workflows already load. */
export type CartForCheck = {
  id: string
  email?: string | null
  currency_code?: string | null
  /** Gross items total before discounts; what minimums and tiers compare against. */
  original_item_total?: unknown
  completed_at?: unknown
  metadata?: Record<string, unknown> | null
  customer_id?: string | null
  customer?: { id?: string | null; groups?: Array<{ id: string } | null> | null } | null
  promotions?: Array<{ code?: string | null } | null> | null
  items?: Array<{ adjustments?: Array<{ code?: string | null } | null> | null } | null> | null
  shipping_methods?: Array<{ adjustments?: Array<{ code?: string | null } | null> | null } | null> | null
}

export type CodeCheck =
  | { result: "valid"; group: string; coupon: CouponWithPromotions }
  | { result: "foreign"; code: string }
  | {
      result: "rejected"
      group: string
      reason: PolicyReason
      message: { pl: string; en: string }
      min_subtotal: number | null
      coupon: CouponWithPromotions | null
    }

/** Codes on the cart: applied promotions, or the adjustments when the cart has no `promotions` loaded. */
export function codesOnCart(cart: CartForCheck): string[] {
  const fromPromotions = (cart.promotions ?? []).map((p) => p?.code).filter((c): c is string => !!c)
  const fromAdjustments = [...(cart.items ?? []), ...(cart.shipping_methods ?? [])]
    .flatMap((line) => line?.adjustments ?? [])
    .map((a) => a?.code)
    .filter((c): c is string => !!c)
  return [...new Set([...fromPromotions, ...fromAdjustments])]
}

/** Tiered coupon codes the customer entered, as stored on the cart. */
export function enteredOnCart(cart: CartForCheck): string[] {
  const value = cart.metadata?.[CART_METADATA_KEY]
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map(normalizeCode) : []
}

/** Lowest basket a coupon needs: its minimum, and for tiered coupons the first level. */
export function effectiveMinimum(draft: CouponDraft): number | null {
  const levels = draft.tiers?.length ? Math.min(...draft.tiers.map((t) => t.min)) : null
  const values = [draft.min_subtotal, levels].filter((v): v is number => v != null && v > 0)
  return values.length ? Math.max(...values) : null
}

/** Which of the coupon's promotions a typed code refers to. */
function targetPromotions(coupon: CouponWithPromotions, code: string): PromotionRecord[] {
  if (coupon.batch_size != null) return coupon.promotions.filter((p) => normalizeCode(p.code) === code)
  return coupon.promotions
}

/** Reasons core would give silently: paused, not started, ended, used up. */
export function lifecycleReason(coupon: CouponWithPromotions, code: string, now: Date): PolicyReason | null {
  const promotions = targetPromotions(coupon, code)
  if (!promotions.length) return "not_found"
  const first = promotions[0]
  if (first.ends_at && new Date(first.ends_at).getTime() <= now.getTime()) return "ended"
  if (!promotions.some((p) => p.status === "active")) return "paused"
  if (first.starts_at && new Date(first.starts_at).getTime() > now.getTime()) return "not_started"
  if (coupon.tiered) {
    if (first.budget_limit != null && first.budget_used >= first.budget_limit) return "exhausted"
  } else if (first.limit != null && first.used >= first.limit) {
    return "exhausted"
  }
  return null
}

function rejected(
  group: string,
  reason: PolicyReason,
  coupon: CouponWithPromotions | null,
  cart: CartForCheck
): CodeCheck {
  const min = coupon ? effectiveMinimum(coupon.draft) : null
  const currency_code = coupon?.draft.currency_code ?? cart.currency_code ?? null
  return {
    result: "rejected",
    group,
    reason,
    min_subtotal: min,
    coupon,
    message: {
      pl: policyMessage(reason, "pl", { min, currency_code }),
      en: policyMessage(reason, "en", { min, currency_code }),
    },
  }
}

/**
 * Whether `code` may be used on `cart`, and why not. The same check runs
 * when a code is added, from `/store/coupons/check`, and before the order
 * is placed. Codes of promotions not created by this plugin are left to core.
 */
export async function checkCode(
  container: MedusaContainer,
  cart: CartForCheck,
  code: string,
  now = new Date(),
  preloaded?: { known?: Map<string, KnownPromotion> }
): Promise<CodeCheck> {
  const typed = normalizeCode(code)
  const onCart = codesOnCart(cart)
  const entered = enteredOnCart(cart)
  const known = preloaded?.known ?? (await loadKnownPromotions(container, [code, ...onCart]))
  const promotion = known.get(code) ?? known.get(typed)

  if (promotion && !promotion.coupon) return { result: "foreign", code }
  const group = promotion?.coupon?.coupons_group ?? typed
  const [coupon] = await loadCoupons(container, { code: group })
  if (!coupon) return rejected(group, "not_found", null, cart)

  // A hidden level code is not something a customer types.
  if (coupon.tiered && !coupon.automatic && typed !== coupon.code) return rejected(group, "not_found", coupon, cart)
  if (coupon.automatic) return rejected(group, "not_found", coupon, cart)

  const lifecycle = lifecycleReason(coupon, typed, now)
  if (lifecycle) return rejected(group, lifecycle, coupon, cart)

  const draft = coupon.draft
  const customerId = cart.customer?.id ?? cart.customer_id ?? null
  const email = cart.email ?? null
  const needsOrders = draft.first_order_only || draft.per_customer_limit != null
  const orders = needsOrders ? await loadCustomerOrders(container, { customer_id: customerId, email }) : []
  const couponCodes = new Set(coupon.promotions.map((p) => p.code))

  const loadedGroups = cart.customer?.groups
  const groupIds =
    loadedGroups != null
      ? loadedGroups.filter((g): g is { id: string } => !!g).map((g) => g.id)
      : customerId && draft.audience === "groups"
        ? await loadCustomerGroupIds(container, customerId)
        : []

  const tierGroups = await loadTierGroups(container, entered)
  const applied = appliedGroups(onCart, entered, known, tierGroups).map(({ group: g, exclusive }) => ({
    group: g,
    exclusive,
  }))

  const reason = evaluatePolicy({
    coupon: {
      exclusive: coupon.exclusive,
      first_order_only: draft.first_order_only,
      audience: draft.audience,
      audience_ids: draft.audience_ids,
      per_customer_limit: draft.per_customer_limit,
      min_subtotal: effectiveMinimum(draft),
      currency_code: draft.currency_code,
    },
    customer: { id: customerId, group_ids: groupIds },
    email,
    orders_count: orders.length,
    uses_by_customer: orders.filter((order) => order.codes.some((c) => couponCodes.has(c))).length,
    basket_total: Number(cart.original_item_total ?? 0),
    applied,
    group,
  })
  return reason ? rejected(group, reason, coupon, cart) : { result: "valid", group, coupon }
}
