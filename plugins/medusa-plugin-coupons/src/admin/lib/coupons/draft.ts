import type { CouponDraft } from "./api"
import { toIntlLocale } from "./kit/format"

/** The plugin speaks Polish and English; any other admin language gets English. */
export function adminLocale(language: string | undefined): "pl" | "en" {
  return (language ?? "").toLowerCase().startsWith("pl") ? "pl" : "en"
}

export function emptyDraft(currencyCode = "pln"): CouponDraft {
  return {
    kind: "percentage",
    value: 15,
    currency_code: currencyCode,
    category_ids: [],
    buy_qty: 3,
    get_qty: 1,
    buy_product_ids: [],
    tiers: null,
    code: "",
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
    exclusions: { product_ids: [], collection_ids: [], category_ids: [], skip_discounted: false },
  }
}

/** Amounts are in major units, like the rest of Medusa's API: `255,00 zł`. */
export function money(amount: number, currency: string | null | undefined, language: string): string {
  try {
    return new Intl.NumberFormat(toIntlLocale(language) ?? "en-US", {
      style: "currency",
      currency: (currency || "pln").toUpperCase(),
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${(currency || "").toUpperCase()}`
  }
}

/** `13 lis 2026` / `13 Nov 2026`. */
export function shortDate(value: string | null | undefined, language: string): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat(toIntlLocale(language) ?? "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

/* Validity presets -------------------------------------------------------- */

/** End of the last day of the current month, local time. */
export function endOfMonth(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
}

export function plusDays(days: number, now = new Date()): string {
  const end = new Date(now)
  end.setDate(end.getDate() + days)
  end.setHours(23, 59, 59, 0)
  return end.toISOString()
}

/* Preview ----------------------------------------------------------------- */

/**
 * The example under the value: "a 300,00 zł basket costs 255,00 zł after
 * the discount". Uses the minimum basket or first tier when higher than 300.
 */
export function example(draft: CouponDraft): { basket: number; after: number } | null {
  const firstTier = draft.tiers?.length ? [...draft.tiers].sort((a, b) => a.min - b.min)[0] : null
  const basket = Math.max(300, draft.min_subtotal ?? 0, firstTier?.min ?? 0)
  const value = firstTier ? firstTier.value : draft.value
  if (value == null) return null
  if (draft.kind === "percentage") return { basket, after: round(basket * (1 - Math.min(value, 100) / 100)) }
  if (draft.kind === "fixed") return { basket, after: round(Math.max(0, basket - value)) }
  return null
}

const round = (n: number) => Math.round(n * 100) / 100

/* Readiness per wizard step ---------------------------------------------- */

const STEP_OF: Record<string, 1 | 2 | 3> = {
  value_required: 1,
  percent_out_of_range: 1,
  currency_required: 1,
  category_required: 1,
  buy_get_invalid: 1,
  buy_products_required: 1,
  tiers_too_few: 1,
  tiers_min_invalid: 1,
  tiers_value_invalid: 1,
  tiers_percent_over_100: 1,
  tiers_min_not_increasing: 1,
  tiers_value_not_increasing: 1,
  tiers_not_supported: 1,
  audience_required: 2,
  code_required: 3,
  code_invalid: 3,
  code_taken: 3,
  ends_before_start: 3,
  usage_limit_invalid: 3,
  per_customer_limit_invalid: 3,
  min_subtotal_invalid: 3,
}

export function stepOfError(error: string): 1 | 2 | 3 {
  return STEP_OF[error] ?? 3
}
