import { normalizeCode } from "./format"
import { type CouponPromotionMetadata, itemKeys } from "./promotions"

/** Where the codes of tiered coupons the customer entered are kept. */
export const CART_METADATA_KEY = "coupons_codes"

export type PromotionAction = "add" | "remove" | "replace"

/** What the hooks know about a promotion code on the cart, from its metadata. */
export type KnownPromotion = {
  code: string
  is_automatic: boolean
  /** Present only for promotions this plugin created. */
  coupon: CouponPromotionMetadata | null
}

/** A tiered coupon the customer can type: its group code and exclusivity. */
export type TierGroup = { group: string; exclusive: boolean }

export type CartForContext = {
  items?: Array<object | null> | null
  metadata?: Record<string, unknown> | null
  promotions?: Array<{ code?: string | null } | null> | null
}

export type CustomerForContext = { id: string | null; group_ids: string[]; first_order: boolean }

const codesOf = (values: unknown): string[] =>
  Array.isArray(values) ? values.filter((v): v is string => typeof v === "string").map(normalizeCode) : []

/** Tiered coupon codes the customer entered, after this action. */
export function enteredTierCodes(
  cart: CartForContext,
  action: PromotionAction,
  promoCodes: string[],
  known: Map<string, KnownPromotion>,
  tierGroups: Map<string, TierGroup>
): string[] {
  const current = new Set(codesOf(cart.metadata?.[CART_METADATA_KEY]).filter((code) => tierGroups.has(code)))
  const incoming = promoCodes.map(normalizeCode)
  if (action === "add") {
    for (const code of incoming) if (tierGroups.has(code)) current.add(code)
  } else if (action === "remove") {
    for (const code of incoming) {
      current.delete(code)
      // Removing one of the hidden level codes removes the whole coupon.
      const group = known.get(code)?.coupon?.coupons_group
      if (group) current.delete(group)
    }
  }
  return [...current].sort()
}

/** Codes of the promotions on the cart after this action, the way core will compute them. */
export function codesAfterAction(cart: CartForContext, action: PromotionAction, promoCodes: string[]): string[] {
  const onCart = (cart.promotions ?? []).map((p) => p?.code).filter((c): c is string => !!c)
  const incoming = promoCodes.map(normalizeCode)
  if (action === "replace") return [...new Set(promoCodes)]
  if (action === "remove") return onCart.filter((code) => !incoming.includes(normalizeCode(code)))
  return [...new Set([...onCart, ...promoCodes])]
}

/**
 * One entry per coupon on the cart for the exclusivity checks. Automatic
 * coupons of this plugin step aside by themselves (a context rule), so they
 * never block a code. Promotions from elsewhere count as they are.
 */
export function appliedGroups(
  codes: string[],
  enteredTiers: string[],
  known: Map<string, KnownPromotion>,
  tierGroups: Map<string, TierGroup>
): Array<{ group: string; exclusive: boolean; entered: boolean }> {
  const result = new Map<string, { group: string; exclusive: boolean; entered: boolean }>()
  for (const code of codes) {
    const info = known.get(normalizeCode(code)) ?? known.get(code)
    const coupon = info?.coupon
    if (coupon && !coupon.coupons_entered) continue
    const group = coupon?.coupons_group ?? code
    const entered = coupon ? coupon.coupons_entered : !(info?.is_automatic ?? false)
    result.set(group, { group, exclusive: coupon?.coupons_exclusive ?? false, entered })
  }
  for (const code of enteredTiers) {
    const tier = tierGroups.get(code)
    result.set(code, { group: code, exclusive: tier?.exclusive ?? false, entered: true })
  }
  return [...result.values()]
}

/**
 * The attributes the plugin adds to the promotion context (see `CONTEXT` in
 * `promotions.ts`). Every key is always present: core drops automatic
 * promotions whose rules name a missing attribute.
 */
export function buildPromotionContext(input: {
  cart: CartForContext
  action: PromotionAction
  promo_codes: string[]
  known: Map<string, KnownPromotion>
  tierGroups: Map<string, TierGroup>
  customer: CustomerForContext
}): Record<string, unknown> {
  const enteredTiers = enteredTierCodes(input.cart, input.action, input.promo_codes, input.known, input.tierGroups)
  const codes = codesAfterAction(input.cart, input.action, input.promo_codes)
  const applied = appliedGroups(codes, enteredTiers, input.known, input.tierGroups).filter((entry) => entry.entered)

  const items = (input.cart.items ?? [])
    .filter((item): item is object => !!item)
    .map((item) => ({
      ...item,
      coupons_keys: itemKeys(item as Parameters<typeof itemKeys>[0]),
    }))

  return {
    items,
    coupons_codes: enteredTiers,
    coupons_customer: {
      id: input.customer.id ?? "guest",
      group_ids: input.customer.group_ids,
      first_order: input.customer.first_order ? "true" : "false",
    },
    coupons_has_codes: applied.length > 0 ? "true" : "false",
    coupons_exclusive_code: applied.some((entry) => entry.exclusive) ? "true" : "false",
  }
}
