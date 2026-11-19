import { formatDate, formatDateTime, toIntlLocale } from "./kit/format"
import type { Totals } from "./api"

export { errorMessage } from "./kit/format"

const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
])

/**
 * `255,00 zł` from 25500 grosze. Amounts stay integers everywhere; they
 * become a decimal only here, for display.
 */
export function money(minor: number | null | undefined, currency: string | null | undefined, language: string): string {
  if (minor == null || !currency) return "—"
  const digits = ZERO_DECIMAL.has(currency.toLowerCase()) ? 0 : 2
  try {
    return new Intl.NumberFormat(toIntlLocale(language) ?? "en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(minor / 10 ** digits)
  } catch {
    return `${minor} ${currency.toUpperCase()}`
  }
}

/** One line per currency, never added together: `255,00 zł · 12,00 €`. */
export function totals(value: Totals | null | undefined, language: string): string {
  const entries = Object.entries(value ?? {}).filter(([, v]) => v !== 0)
  return entries.length ? entries.map(([currency, amount]) => money(amount, currency, language)).join(" · ") : "—"
}

/** `13 lis 2026` from a Unix timestamp in seconds. */
export function date(seconds: number | null | undefined, language: string): string {
  return formatDate(seconds ? new Date(seconds * 1000) : null, language)
}

export function dateTime(seconds: number | null | undefined, language: string): string {
  return formatDateTime(seconds ? new Date(seconds * 1000) : null, language)
}

/** 934 per mille → `93,4%`. */
export function percent(perMille: number | null, language: string): string {
  if (perMille == null) return "—"
  return new Intl.NumberFormat(toIntlLocale(language) ?? "en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(perMille / 1000)
}
