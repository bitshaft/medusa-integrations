/** The benefit a coupon gives. Each maps onto one Medusa promotion type. */
export const COUPON_KINDS = ["percentage", "fixed", "free_shipping", "category", "buy_get"] as const
export type CouponKind = (typeof COUPON_KINDS)[number]

/** Who may use a coupon. */
export const AUDIENCES = ["all", "groups", "customers"] as const
export type Audience = (typeof AUDIENCES)[number]

export const LOCALES = ["pl", "en"] as const
export type Locale = (typeof LOCALES)[number]

/** Products, collections and categories a coupon never discounts. */
export type Exclusions = {
  product_ids: string[]
  collection_ids: string[]
  category_ids: string[]
  /** Skip items that already carry a lower price (sale price lists). */
  skip_discounted: boolean
}

/** One level of a tiered coupon: `value` (percent or amount) once the basket reaches `min`. */
export type Tier = { min: number; value: number }

/**
 * What the admin wizard collects and what the plugin stores, before it is
 * translated into Promotion Module records. Amounts are in major units
 * (300 means 300.00 of the currency), like Medusa's own API.
 */
export type CouponDraft = {
  kind: CouponKind
  /** Percent for `percentage`, amount for `fixed`. Unused by the other kinds. */
  value: number | null
  currency_code: string | null
  /** Categories a `category` coupon applies to. */
  category_ids: string[]
  /** `buy_get`: buy `buy_qty` products from `buy_product_ids`, get `get_qty` of them at `value` percent off (100 = free). */
  buy_qty: number | null
  get_qty: number | null
  buy_product_ids: string[]
  /** Optional levels; each level applies only while the basket is in its band. */
  tiers: Tier[] | null
  /** Public code. Null for automatic coupons. */
  code: string | null
  automatic: boolean
  starts_at: string | null
  ends_at: string | null
  /** Total uses across all customers. */
  usage_limit: number | null
  /** Uses per customer (matched by e-mail, so guests are covered too). */
  per_customer_limit: number | null
  audience: Audience
  audience_ids: string[]
  first_order_only: boolean
  exclusive: boolean
  /** Gross basket value before shipping the basket must reach. */
  min_subtotal: number | null
  exclusions: Exclusions
}

export const EMPTY_EXCLUSIONS: Exclusions = {
  product_ids: [],
  collection_ids: [],
  category_ids: [],
  skip_discounted: false,
}

/** Display names for ids, used by the sentence generator. Optional: ids are shown when a name is missing. */
export type CouponNames = {
  categories?: Record<string, string>
  groups?: Record<string, string>
  products?: Record<string, string>
}
