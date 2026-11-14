import { formatDate, formatMoney, pluralPl } from "./format"
import type { Locale } from "./types"

export type CustomerTextInput = {
  /** Points the current basket or order would earn. */
  order_points: number
  balance: number
  tier_name: string | null
  next_tier: { name: string; remaining: number } | null
  expires_at: Date | string | null
  currency_code: string
  time_zone: string
}

const pts = (n: number, locale: Locale) =>
  locale === "pl"
    ? `${n} ${pluralPl(n, ["punkt", "punkty", "punktów"])}`
    : `${n} ${Math.abs(n) === 1 ? "point" : "points"}`

/**
 * Sentences a storefront can show as they are, and the admin previews
 * under "What the customer sees". Only facts, no marketing.
 */
export function customerTexts(input: CustomerTextInput, locale: Locale): Record<string, string | null> {
  const money = (n: number) => formatMoney(n, input.currency_code, locale)
  const pl = locale === "pl"
  return {
    order:
      input.order_points > 0
        ? pl
          ? `Za to zamówienie dostaniesz ${pts(input.order_points, locale)}.`
          : `You will get ${pts(input.order_points, locale)} for this order.`
        : null,
    balance: pl ? `Masz ${pts(input.balance, locale)}.` : `You have ${pts(input.balance, locale)}.`,
    tier: input.tier_name ? (pl ? `Twój poziom: ${input.tier_name}.` : `Your tier: ${input.tier_name}.`) : null,
    next_tier: input.next_tier
      ? pl
        ? `Do poziomu ${input.next_tier.name} brakuje ${money(input.next_tier.remaining)}.`
        : `${money(input.next_tier.remaining)} more to reach ${input.next_tier.name}.`
      : null,
    expiry:
      input.expires_at && input.balance > 0
        ? pl
          ? `Punkty wygasną ${formatDate(input.expires_at, locale, input.time_zone)}, jeśli do tego czasu nic nie kupisz ani nie wymienisz.`
          : `Your points expire on ${formatDate(input.expires_at, locale, input.time_zone)} unless you order or redeem before then.`
        : null,
  }
}
