import { formatDate, formatMoney } from "../format"
import type { Locale } from "../types"
import type { VariantOmnibus } from "./prices"

/** The Omnibus data of one variant and region, ready for the product page. */
export function storeOmnibus(row: VariantOmnibus, locale: Locale, periodDays: number) {
  const money = (amount: number | null) => (amount == null ? null : formatMoney(amount, row.currency_code, locale))
  const showLowest = row.discounted && !row.exempt
  return {
    variant_id: row.variant_id,
    region_id: row.region_id,
    currency_code: row.currency_code,
    price: row.amount,
    regular_price: row.regular,
    discounted: row.discounted,
    discount_started_at: row.discount_started_at?.toISOString() ?? null,
    lowest_price: showLowest ? row.lowest : null,
    period_days: periodDays,
    /** The history does not cover the whole period (fresh installation): the lowest price may be wrong. */
    history_incomplete: showLowest ? row.history_incomplete : false,
    /** On sale for less than the period: the lowest price counts since this date. */
    sold_since: showLowest ? (row.sold_since?.toISOString() ?? null) : null,
    exempt: row.exempt,
    formatted: {
      price: money(row.amount),
      regular_price: money(row.regular),
      lowest_price: showLowest ? money(row.lowest) : null,
      discount_started_at: row.discount_started_at ? formatDate(row.discount_started_at, locale) : null,
    },
  }
}
