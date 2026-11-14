import { sortedTiers, tierBand } from "./tiers"
import type { CouponDraft } from "./types"

/**
 * Attributes the plugin adds to the promotion context in the
 * `setPromotionContext` hook of `updateCartPromotionsWorkflow`. Every plugin
 * condition is a plain Promotion Module rule on one of these, so the core
 * evaluates it on every cart change, for automatic coupons too.
 *
 * Core drops automatic promotions whose rules name an attribute missing from
 * the context, so the hook always sets every one of them (see `context.ts`).
 */
export const CONTEXT = {
  /** Group codes of tiered coupons the customer entered (kept in `cart.metadata.coupons_codes`). */
  codes: "coupons_codes",
  customerId: "coupons_customer.id",
  groupIds: "coupons_customer.group_ids",
  /** "true" when the customer (by id or e-mail) has no earlier orders. */
  firstOrder: "coupons_customer.first_order",
  /** "true" when an exclusive coupon entered by code is on the cart. */
  exclusiveCode: "coupons_exclusive_code",
  /** "true" when any code entered by the customer is on the cart. */
  hasCodes: "coupons_has_codes",
  /** Per item: "*", "p:<product>", "c:<collection>", "k:<category>", and "sale" for marked-down items. */
  itemKeys: "items.coupons_keys",
} as const

/** Key every item carries, so the attribute is never missing. */
export const ANY_ITEM_KEY = "*"
export const SALE_ITEM_KEY = "sale"

/** Metadata the plugin stores on each promotion it creates, so hooks need no extra lookup. */
/**
 * The basket value minimums and tier bands compare against: gross, before
 * discounts, without shipping. Not `item_total`, which is after discounts:
 * a "15% from 300" coupon would then switch itself off at a 310 basket.
 */
export const BASKET_ATTRIBUTE = "original_item_total"

export type CouponPromotionMetadata = {
  coupons_group: string
  coupons_tier: number | null
  coupons_exclusive: boolean
  coupons_entered: boolean
}

type Rule = { attribute: string; operator: "in" | "eq" | "ne" | "gte" | "lt"; values: string[] }

/** What `createPromotionsWorkflow` receives for one promotion (campaign added by the caller). */
export type PromotionSpec = {
  code: string
  type: "standard" | "buyget"
  status: "active" | "inactive"
  is_automatic: boolean
  is_tax_inclusive: boolean
  limit: number | null
  rules: Rule[]
  application_method: {
    type: "percentage" | "fixed"
    target_type: "order" | "items" | "shipping_methods"
    allocation: "each" | "across"
    value: number
    currency_code?: string
    target_rules?: Rule[]
    buy_rules?: Rule[]
    buy_rules_min_quantity?: number
    apply_to_quantity?: number
    max_quantity?: number
  }
  metadata: CouponPromotionMetadata
}

/** The hidden code of a tier level: `JESIEN__T2`. Customers never type it. */
export function tierCode(group: string, index: number): string {
  return `${group}__T${index + 1}`
}

const num = (value: number) => String(value)

/** Items a coupon must not discount, as one `ne` rule on the item keys. */
export function exclusionRule(draft: CouponDraft): Rule | null {
  const keys = [
    ...draft.exclusions.product_ids.map((id) => `p:${id}`),
    ...draft.exclusions.collection_ids.map((id) => `c:${id}`),
    ...draft.exclusions.category_ids.map((id) => `k:${id}`),
    ...(draft.exclusions.skip_discounted ? [SALE_ITEM_KEY] : []),
  ]
  return keys.length ? { attribute: CONTEXT.itemKeys, operator: "ne", values: keys } : null
}

/** Rules every promotion of the coupon shares: audience, first order, exclusivity. */
function sharedRules(draft: CouponDraft): Rule[] {
  const rules: Rule[] = []
  if (draft.audience === "customers") {
    rules.push({ attribute: CONTEXT.customerId, operator: "in", values: draft.audience_ids })
  } else if (draft.audience === "groups") {
    rules.push({ attribute: CONTEXT.groupIds, operator: "in", values: draft.audience_ids })
  }
  if (draft.first_order_only) {
    rules.push({ attribute: CONTEXT.firstOrder, operator: "eq", values: ["true"] })
  }
  if (draft.automatic) {
    // An automatic coupon (no code typed by the customer) steps aside rather than combine:
    // exclusive ones whenever the customer entered any code, the others
    // when the customer entered an exclusive code.
    rules.push(
      draft.exclusive
        ? { attribute: CONTEXT.hasCodes, operator: "ne", values: ["true"] }
        : { attribute: CONTEXT.exclusiveCode, operator: "ne", values: ["true"] }
    )
  }
  return rules
}

function applicationMethod(draft: CouponDraft, value: number): PromotionSpec["application_method"] {
  const exclusion = exclusionRule(draft)
  const exclusions = exclusion ? [exclusion] : []
  // Whole-order discounts target the items with "across" allocation. Core
  // computes an "order" target exactly that way, but refuses target rules on
  // it, and exclusions are target rules. "each" would need a max quantity.
  switch (draft.kind) {
    case "percentage":
      return { type: "percentage", target_type: "items", allocation: "across", value, target_rules: exclusions }
    case "fixed":
      return {
        type: "fixed",
        target_type: "items",
        allocation: "across",
        value,
        currency_code: draft.currency_code ?? undefined,
        target_rules: exclusions,
      }
    case "free_shipping":
      return { type: "percentage", target_type: "shipping_methods", allocation: "across", value: 100 }
    case "category":
      return {
        type: "percentage",
        target_type: "items",
        allocation: "across",
        value,
        target_rules: [
          { attribute: CONTEXT.itemKeys, operator: "in", values: draft.category_ids.map((id) => `k:${id}`) },
          ...exclusions,
        ],
      }
    case "buy_get": {
      const products = {
        attribute: CONTEXT.itemKeys,
        operator: "in" as const,
        values: draft.buy_product_ids.map((id) => `p:${id}`),
      }
      return {
        type: "percentage",
        target_type: "items",
        allocation: "each",
        value,
        buy_rules: [products],
        buy_rules_min_quantity: draft.buy_qty ?? 1,
        apply_to_quantity: draft.get_qty ?? 1,
        max_quantity: draft.get_qty ?? 1,
        target_rules: [products, ...exclusions],
      }
    }
  }
}

/**
 * The Promotion Module records for a coupon. A plain coupon is one
 * promotion. A tiered coupon is one automatic promotion per level, each
 * limited to its basket band and, when the coupon has a code, opened only
 * by that code on the cart; so the customer gets exactly the highest level
 * they reach. Dates and the shared usage budget go on the campaign.
 */
export function buildPromotions(draft: CouponDraft, group: string): PromotionSpec[] {
  const minRule: Rule[] =
    draft.min_subtotal != null && draft.min_subtotal > 0
      ? [{ attribute: BASKET_ATTRIBUTE, operator: "gte", values: [num(draft.min_subtotal)] }]
      : []
  const entered = !draft.automatic

  if (draft.tiers && draft.tiers.length > 0) {
    const tiers = sortedTiers(draft.tiers)
    return tiers.map((tier, index) => {
      const band = tierBand(tiers, index)
      const rules: Rule[] = [
        ...sharedRules(draft),
        { attribute: BASKET_ATTRIBUTE, operator: "gte", values: [num(Math.max(band.gte, draft.min_subtotal ?? 0))] },
        ...(band.lt != null ? [{ attribute: BASKET_ATTRIBUTE, operator: "lt" as const, values: [num(band.lt)] }] : []),
        ...(entered ? [{ attribute: CONTEXT.codes, operator: "in" as const, values: [group] }] : []),
      ]
      return {
        code: tierCode(group, index),
        type: "standard",
        status: "active",
        is_automatic: true,
        is_tax_inclusive: true,
        limit: null,
        rules,
        application_method: applicationMethod(draft, tier.value),
        metadata: {
          coupons_group: group,
          coupons_tier: index,
          coupons_exclusive: draft.exclusive,
          coupons_entered: entered,
        },
      }
    })
  }

  return [
    {
      code: group,
      type: draft.kind === "buy_get" ? "buyget" : "standard",
      status: "active",
      is_automatic: draft.automatic,
      is_tax_inclusive: true,
      limit: draft.usage_limit,
      rules: [...sharedRules(draft), ...minRule],
      application_method: applicationMethod(
        draft,
        draft.kind === "buy_get" ? (draft.value ?? 100) : (draft.value ?? 0)
      ),
      metadata: {
        coupons_group: group,
        coupons_tier: null,
        coupons_exclusive: draft.exclusive,
        coupons_entered: entered,
      },
    },
  ]
}

/**
 * The campaign that carries the dates, and for tiered coupons the usage
 * limit shared by all levels. Tiered coupons always get a budget (a null
 * limit means unlimited), so a limit can be added later by editing.
 */
export function buildCampaign(draft: CouponDraft, group: string) {
  const tiered = !!draft.tiers && draft.tiers.length > 0
  return {
    name: `Coupon ${group}`,
    campaign_identifier: `coupons-${group}`.toLowerCase(),
    starts_at: draft.starts_at ? new Date(draft.starts_at) : null,
    ends_at: draft.ends_at ? new Date(draft.ends_at) : null,
    ...(tiered ? { budget: { type: "usage" as const, limit: draft.usage_limit ?? null } } : {}),
  }
}

/** Keys of one cart item for `items.coupons_keys`. */
export function itemKeys(item: {
  product_id?: string | null
  product?: { id?: string | null; collection_id?: string | null; categories?: Array<{ id: string }> | null } | null
  unit_price?: unknown
  compare_at_unit_price?: unknown
}): string[] {
  const keys = [ANY_ITEM_KEY]
  const productId = item.product?.id ?? item.product_id
  if (productId) keys.push(`p:${productId}`)
  if (item.product?.collection_id) keys.push(`c:${item.product.collection_id}`)
  for (const category of item.product?.categories ?? []) keys.push(`k:${category.id}`)
  const price = Number(item.unit_price)
  const compareAt = item.compare_at_unit_price == null ? NaN : Number(item.compare_at_unit_price)
  if (Number.isFinite(compareAt) && compareAt > price) keys.push(SALE_ITEM_KEY)
  return keys
}
