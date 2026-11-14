import type { Locale } from "./types"

export const DEFAULT_TIME_ZONE = "Europe/Warsaw"

const INTL: Record<Locale, string> = { pl: "pl-PL", en: "en-GB" }

/** `255,00 zł` / `PLN 255.00`. */
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

/** Polish plural: 1 punkt, 2 punkty, 5 punktów, 22 punkty. */
export function pluralPl(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count)
  if (abs === 1) return forms[0]
  const last = abs % 10
  const lastTwo = abs % 100
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? forms[1] : forms[2]
}

/** `255 pkt` / `255 points`, with thousands separators. */
export function formatPoints(points: number, locale: Locale): string {
  const n = new Intl.NumberFormat(INTL[locale]).format(points)
  return locale === "pl" ? `${n} pkt` : `${n} ${Math.abs(points) === 1 ? "point" : "points"}`
}

export function normalizeLocale(value: unknown, fallback: Locale): Locale {
  if (typeof value !== "string") return fallback
  const lang = value.trim().toLowerCase().slice(0, 2)
  return lang === "pl" || lang === "en" ? lang : fallback
}
