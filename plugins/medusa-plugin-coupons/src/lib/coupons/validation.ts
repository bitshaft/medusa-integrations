import { isValidCode } from "./codes"
import { normalizeCode } from "./format"
import { validateTiers, type TierError } from "./tiers"
import type { CouponDraft } from "./types"

export type DraftError =
  | "code_required"
  | "code_invalid"
  | "code_taken"
  | "value_required"
  | "percent_out_of_range"
  | "currency_required"
  | "category_required"
  | "buy_get_invalid"
  | "buy_products_required"
  | "ends_before_start"
  | "usage_limit_invalid"
  | "per_customer_limit_invalid"
  | "audience_required"
  | "min_subtotal_invalid"
  | "tiers_too_few"
  | "tiers_min_invalid"
  | "tiers_value_invalid"
  | "tiers_percent_over_100"
  | "tiers_min_not_increasing"
  | "tiers_value_not_increasing"
  | "tiers_not_supported"

export type DraftWarning =
  "overlaps_active_coupon" | "full_discount" | "discount_above_minimum" | "no_conditions_automatic"

export type DraftContext = {
  /** Another coupon with this code already exists. */
  codeTaken?: boolean
  /** Another active coupon applies to the same part of the order. */
  overlapsActive?: boolean
}

export type DraftReport = { errors: DraftError[]; warnings: DraftWarning[] }

const TIER_ERRORS: Record<TierError, DraftError> = {
  too_few: "tiers_too_few",
  min_not_positive: "tiers_min_invalid",
  value_not_positive: "tiers_value_invalid",
  percent_over_100: "tiers_percent_over_100",
  min_not_increasing: "tiers_min_not_increasing",
  value_not_increasing: "tiers_value_not_increasing",
}

/** Errors block saving; warnings are shown above the save button and do not. */
export function validateDraft(draft: CouponDraft, context: DraftContext = {}): DraftReport {
  const errors = new Set<DraftError>()
  const warnings = new Set<DraftWarning>()

  if (draft.automatic) {
    // Automatic coupons have no code the customer types.
  } else if (!draft.code || !normalizeCode(draft.code)) {
    errors.add("code_required")
  } else if (!isValidCode(draft.code)) {
    errors.add("code_invalid")
  }
  if (draft.code && context.codeTaken) errors.add("code_taken")

  if (draft.starts_at && draft.ends_at && new Date(draft.ends_at) <= new Date(draft.starts_at)) {
    errors.add("ends_before_start")
  }
  if (draft.usage_limit != null && (!Number.isInteger(draft.usage_limit) || draft.usage_limit < 1)) {
    errors.add("usage_limit_invalid")
  }
  if (
    draft.per_customer_limit != null &&
    (!Number.isInteger(draft.per_customer_limit) || draft.per_customer_limit < 1)
  ) {
    errors.add("per_customer_limit_invalid")
  }
  if (draft.min_subtotal != null && !(draft.min_subtotal >= 0)) {
    errors.add("min_subtotal_invalid")
  }
  if ((draft.audience === "groups" || draft.audience === "customers") && draft.audience_ids.length === 0) {
    errors.add("audience_required")
  }

  const tiered = draft.tiers != null && draft.tiers.length > 0
  if (tiered) {
    if (draft.kind !== "percentage" && draft.kind !== "fixed") {
      errors.add("tiers_not_supported")
    } else {
      for (const tierError of validateTiers(draft.tiers!, draft.kind)) errors.add(TIER_ERRORS[tierError])
    }
    if (draft.kind === "fixed" && !draft.currency_code) errors.add("currency_required")
  } else {
    switch (draft.kind) {
      case "percentage":
        if (draft.value == null) errors.add("value_required")
        else if (!(draft.value > 0 && draft.value <= 100)) errors.add("percent_out_of_range")
        break
      case "fixed":
        if (draft.value == null || !(draft.value > 0)) errors.add("value_required")
        if (!draft.currency_code) errors.add("currency_required")
        break
      case "category":
        if (draft.category_ids.length === 0) errors.add("category_required")
        if (draft.value == null) errors.add("value_required")
        else if (!(draft.value > 0 && draft.value <= 100)) errors.add("percent_out_of_range")
        break
      case "buy_get":
        if (!(draft.buy_qty && draft.buy_qty >= 1 && draft.get_qty && draft.get_qty >= 1)) errors.add("buy_get_invalid")
        if (draft.buy_product_ids.length === 0) errors.add("buy_products_required")
        break
      case "free_shipping":
        break
    }
  }

  if (context.overlapsActive && !draft.exclusive) warnings.add("overlaps_active_coupon")

  if (!tiered) {
    if (draft.kind === "percentage" && draft.value != null && draft.value >= 100) warnings.add("full_discount")
    if (
      draft.kind === "fixed" &&
      draft.value != null &&
      draft.min_subtotal != null &&
      draft.min_subtotal > 0 &&
      draft.value >= draft.min_subtotal
    ) {
      warnings.add("discount_above_minimum")
    }
  }

  const noConditions =
    draft.automatic &&
    draft.audience === "all" &&
    !draft.first_order_only &&
    draft.per_customer_limit == null &&
    draft.usage_limit == null &&
    !(draft.min_subtotal && draft.min_subtotal > 0) &&
    !draft.starts_at &&
    !draft.ends_at &&
    draft.exclusions.product_ids.length === 0 &&
    draft.exclusions.collection_ids.length === 0 &&
    draft.exclusions.category_ids.length === 0 &&
    !draft.exclusions.skip_discounted
  if (noConditions) warnings.add("no_conditions_automatic")

  return { errors: [...errors], warnings: [...warnings] }
}
