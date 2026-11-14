import { type CouponDraft, EMPTY_EXCLUSIONS } from "../types"

/** A valid 15% order coupon; tests override what they need. */
export function draft(overrides: Partial<CouponDraft> = {}): CouponDraft {
  return {
    kind: "percentage",
    value: 15,
    currency_code: "pln",
    category_ids: [],
    buy_qty: null,
    get_qty: null,
    buy_product_ids: [],
    tiers: null,
    code: "JESIEN15",
    automatic: false,
    starts_at: null,
    ends_at: null,
    usage_limit: null,
    per_customer_limit: null,
    audience: "all",
    audience_ids: [],
    first_order_only: false,
    exclusive: false,
    min_subtotal: null,
    exclusions: { ...EMPTY_EXCLUSIONS },
    ...overrides,
  }
}
