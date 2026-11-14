import type { Locale } from "./types"

/** Store time zone used for dates when the settings do not name another one. */
export const DEFAULT_TIME_ZONE = "Europe/Warsaw"

const INTL_LOCALE: Record<Locale, string> = { pl: "pl-PL", en: "en-GB" }

/** Money in the store's locale: `255,00 zł` for pl-PL, `PLN 255.00` for en. */
export function formatMoney(amount: number, currencyCode: string | null | undefined, locale: Locale): string {
  const currency = (currencyCode || "pln").toUpperCase()
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency }).format(amount)
}

/** A plain number with at most two decimals: `12,5` / `12.5`. */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 2 }).format(value)
}

/** A short date in the store's time zone: `1 paź 2026` / `Oct 1, 2026`. */
export function formatDate(value: Date | string, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(date)
}

/**
 * Polish plural form: `pluralPl(1, ["użycie", "użycia", "użyć"])` → "użycie",
 * 2 → "użycia", 5 → "użyć", 22 → "użycia", 12 → "użyć".
 */
export function pluralPl(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count)
  const lastTwo = abs % 100
  const last = abs % 10
  if (abs === 1) return forms[0]
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms[1]
  return forms[2]
}

/** Trims a code and upper-cases it; codes are case-insensitive for customers. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}
