import { formatMoney } from "./format"
import type { Audience, Locale } from "./types"

/**
 * Why a coupon cannot be used on a cart. Core rejects expired, paused and
 * fully used codes itself; the rest are checked here, on the server, when a
 * code is added and again before the order is placed.
 */
export type PolicyReason =
  | "not_found"
  | "not_started"
  | "ended"
  | "paused"
  | "exhausted"
  | "email_required"
  | "audience"
  | "first_order"
  | "per_customer_limit"
  | "min_subtotal"
  | "exclusive_conflict"

export type PolicyCoupon = {
  exclusive: boolean
  first_order_only: boolean
  audience: Audience
  audience_ids: string[]
  per_customer_limit: number | null
  /** Gross basket the coupon needs. For tiered coupons this is the lowest tier. */
  min_subtotal: number | null
  currency_code: string | null
}

export type PolicyInput = {
  coupon: PolicyCoupon
  customer: { id: string | null; group_ids: string[] }
  /** The cart's e-mail, used for per-customer limits and for guests. */
  email: string | null
  /** Earlier orders of this customer (by id or e-mail), cancelled ones excluded. */
  orders_count: number
  /** Earlier orders of this customer that used this coupon. */
  uses_by_customer: number
  /** Gross items total of the cart before discounts (`original_item_total`), shipping excluded. */
  basket_total: number
  /** Other promotions already on the cart, each with its group key (tier coupons share one) and exclusivity. */
  applied: Array<{ group: string; exclusive: boolean }>
  /** The group key of the coupon being checked. */
  group: string
}

/**
 * Checks the plugin's own rules in a fixed order, so a customer always sees
 * the same reason for the same cart. Returns null when the coupon may be used.
 */
export function evaluatePolicy(input: PolicyInput): PolicyReason | null {
  const { coupon } = input

  if (coupon.per_customer_limit != null && !input.email) return "email_required"

  if (coupon.audience === "customers") {
    if (!input.customer.id || !coupon.audience_ids.includes(input.customer.id)) return "audience"
  }
  if (coupon.audience === "groups") {
    const allowed = input.customer.group_ids.some((id) => coupon.audience_ids.includes(id))
    if (!allowed) return "audience"
  }

  if (coupon.first_order_only && input.orders_count > 0) return "first_order"

  if (coupon.per_customer_limit != null && input.uses_by_customer >= coupon.per_customer_limit) {
    return "per_customer_limit"
  }

  if (coupon.min_subtotal != null && coupon.min_subtotal > 0 && input.basket_total < coupon.min_subtotal) {
    return "min_subtotal"
  }

  const others = input.applied.filter((entry) => entry.group !== input.group)
  if (others.length > 0 && (coupon.exclusive || others.some((entry) => entry.exclusive))) {
    return "exclusive_conflict"
  }

  return null
}

/**
 * True when the applied promotions cannot be combined: more than one group
 * is present and at least one of them is exclusive. Used for the automatic
 * coupons too, through a rule in the promotion context.
 */
export function hasExclusiveConflict(applied: Array<{ group: string; exclusive: boolean }>): boolean {
  const groups = new Set(applied.map((entry) => entry.group))
  if (groups.size < 2) return false
  return applied.some((entry) => entry.exclusive)
}

const MESSAGES: Record<PolicyReason, { pl: string; en: string }> = {
  not_found: { pl: "Nie ma takiego kuponu.", en: "This coupon does not exist." },
  not_started: { pl: "Ten kupon jeszcze nie działa.", en: "This coupon is not active yet." },
  ended: { pl: "Ten kupon wygasł.", en: "This coupon has expired." },
  paused: { pl: "Ten kupon jest chwilowo wstrzymany.", en: "This coupon is paused at the moment." },
  exhausted: { pl: "Ten kupon został już w pełni wykorzystany.", en: "This coupon has been fully used." },
  email_required: {
    pl: "Podaj adres e-mail w koszyku, aby użyć tego kuponu.",
    en: "Add your e-mail address to the cart to use this coupon.",
  },
  audience: {
    pl: "Ten kupon nie jest dostępny dla Twojego konta.",
    en: "This coupon is not available for your account.",
  },
  first_order: { pl: "Ten kupon jest tylko na pierwsze zamówienie.", en: "This coupon is only for your first order." },
  per_customer_limit: {
    pl: "Ten kupon został już wykorzystany maksymalną liczbę razy.",
    en: "You have already used this coupon the maximum number of times.",
  },
  min_subtotal: {
    pl: "Ten kupon wymaga koszyka od {min} brutto.",
    en: "This coupon needs a basket of at least {min} gross.",
  },
  exclusive_conflict: {
    pl: "Tego kuponu nie można łączyć z innymi kuponami.",
    en: "This coupon cannot be combined with other coupons.",
  },
}

/** The message for one language, with the minimum basket filled in when the reason needs it. */
export function policyMessage(
  reason: PolicyReason,
  locale: Locale,
  extra: { min?: number | null; currency_code?: string | null } = {}
): string {
  const text = MESSAGES[reason][locale]
  if (!text.includes("{min}")) return text
  const min = formatMoney(extra.min ?? 0, extra.currency_code, locale)
  return text.replace("{min}", min)
}

/**
 * The text thrown into the checkout flow: Polish and English side by side,
 * so the customer reads their own language whichever it is.
 */
export function bilingualPolicyMessage(
  reason: PolicyReason,
  extra: { min?: number | null; currency_code?: string | null } = {}
): string {
  return `${policyMessage(reason, "pl", extra)} / ${policyMessage(reason, "en", extra)}`
}
