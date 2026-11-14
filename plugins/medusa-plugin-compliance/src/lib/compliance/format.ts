import type { Locale } from "./types"

export const DEFAULT_TIME_ZONE = "Europe/Warsaw"

const INTL: Record<Locale, string> = { pl: "pl-PL", en: "en-GB" }

/** `255,00 zł` / `PLN 255.00`. Amounts are in the currency's main unit, as Medusa stores them. */
export function formatMoney(amount: number, currency: string | null | undefined, locale: Locale): string {
  return new Intl.NumberFormat(INTL[locale], { style: "currency", currency: (currency || "pln").toUpperCase() }).format(
    amount
  )
}

/** `13 lis 2026` / `13 Nov 2026`. */
export function formatDate(value: Date | string, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat(INTL[locale], { day: "numeric", month: "short", year: "numeric", timeZone }).format(
    value instanceof Date ? value : new Date(value)
  )
}

export function normalizeLocale(value: unknown, fallback: Locale): Locale {
  if (typeof value !== "string") return fallback
  const lang = value.trim().toLowerCase().slice(0, 2)
  return lang === "pl" || lang === "en" ? lang : fallback
}

export const DAY_MS = 86_400_000

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/** Calendar months, clamped to the end of a shorter month (31 Jan + 1 = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, last))
  return result
}

/** Money as Medusa returns it (number, string or BigNumber) → a number rounded to 1/100. */
export function toAmount(value: unknown): number | null {
  if (value == null) return null
  const n =
    typeof value === "object" && value && "numeric" in value
      ? Number((value as { numeric: unknown }).numeric)
      : Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
