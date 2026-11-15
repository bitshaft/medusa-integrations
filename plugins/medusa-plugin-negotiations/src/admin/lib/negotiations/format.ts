import { toIntlLocale } from "./kit/format"

export { errorMessage } from "./kit/format"

const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "isk",
  "jpy",
  "kmf",
  "krw",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
])
const THREE_DECIMAL = new Set(["bhd", "iqd", "jod", "kwd", "lyd", "omr", "tnd"])

export const digitsOf = (currency: string) =>
  ZERO_DECIMAL.has(currency.toLowerCase()) ? 0 : THREE_DECIMAL.has(currency.toLowerCase()) ? 3 : 2

const locale = (language: string) => toIntlLocale(language) ?? "pl-PL"

/** `2124,98 zł` from 212498 grosze. Amounts stay integers; they become a decimal only here, for display. */
export function money(minor: number | null | undefined, currency: string | null | undefined, language: string): string {
  if (minor == null || !currency) return "—"
  const digits = digitsOf(currency)
  try {
    return new Intl.NumberFormat(locale(language), {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(minor / 10 ** digits)
  } catch {
    return `${minor} ${currency.toUpperCase()}`
  }
}

/** Totals per currency on one line: `1 200,00 zł · 300,00 €`. */
export function totals(values: Record<string, number> | undefined, language: string): string {
  const entries = Object.entries(values ?? {})
  if (!entries.length) return money(0, "pln", language)
  return entries.map(([currency, amount]) => money(amount, currency, language)).join(" · ")
}

/**
 * What a person typed ("2 124,98", "2124.98") → minor units, from the
 * digits alone (no floating point). `null` when it is not an amount.
 */
export function parseMoney(text: string, currency: string): number | null {
  const clean = text.replace(/[\s ]/g, "").replace(/zł|pln|eur|€|\$/gi, "")
  const match = /^(\d+)(?:[.,](\d*))?$/.exec(clean)
  if (!match) return null
  const digits = digitsOf(currency)
  const fraction = match[2] ?? ""
  if (fraction.length > digits) return null
  const minor = Number(match[1] + fraction.padEnd(digits, "0"))
  return Number.isSafeInteger(minor) ? minor : null
}

/** Minor units → the text an input shows ("2124,98"). */
export function moneyInput(minor: number | null | undefined, currency: string): string {
  if (minor == null) return ""
  const digits = digitsOf(currency)
  if (!digits) return String(minor)
  const text = String(minor).padStart(digits + 1, "0")
  return `${text.slice(0, -digits)},${text.slice(-digits)}`
}

/** Basis points → `12,5 %`. */
export function percent(bp: number | null | undefined, language: string): string {
  if (bp == null) return "—"
  return `${new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }).format(bp / 100)} %`
}

export function dateTime(value: string | null | undefined, language: string): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat(locale(language), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function shortDate(value: string | null | undefined, language: string): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat(locale(language), { dateStyle: "medium" }).format(new Date(value))
}

/** "3 godz. temu", "za 2 dni". */
export function relative(value: string | null | undefined, language: string, now = Date.now()): string {
  if (!value) return "—"
  const diff = new Date(value).getTime() - now
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(locale(language), { numeric: "auto" })
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute")
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour")
  return rtf.format(Math.round(diff / 86_400_000), "day")
}

/** Seconds → "2 godz. 15 min" style, for the average first reply. */
export function duration(seconds: number | null | undefined, language: string): string {
  if (seconds == null) return "—"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  const unit = (value: number, kind: "hour" | "minute" | "day") =>
    new Intl.NumberFormat(locale(language), { style: "unit", unit: kind, unitDisplay: "short" }).format(value)
  if (hours >= 48) return unit(Math.round(hours / 24), "day")
  if (hours) return `${unit(hours, "hour")} ${unit(minutes, "minute")}`
  return unit(minutes, "minute")
}

/** "Anna Nowak (Budmax)" or the e-mail. */
export function customerName(c: {
  first_name: string | null
  last_name: string | null
  company_name: string | null
  email: string | null
}) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ")
  if (name && c.company_name) return `${name} (${c.company_name})`
  return name || c.company_name || c.email || "—"
}
