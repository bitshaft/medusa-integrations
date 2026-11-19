import { toIntlLocale } from "./kit/format"

/**
 * Display only: amounts and rates arrive as decimal strings and are handed
 * to `Intl` as strings, which formats them exactly (no float on the way).
 */

const asNumber = (value: string) => value as unknown as number

/** `255,00 zł`, `23,99 €` for pl; `€23.99` for en. */
export function formatMoney(
  amount: string | null | undefined,
  currency: string,
  locale: string,
  decimals?: number
): string {
  if (amount === null || amount === undefined || amount === "") return "—"
  try {
    return new Intl.NumberFormat(toIntlLocale(locale), {
      style: "currency",
      currency: currency.toUpperCase(),
      ...(decimals !== undefined ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : {}),
    }).format(asNumber(amount))
  } catch {
    return `${amount} ${currency.toUpperCase()}`
  }
}

/** A rate with as many places as it has (at least 2, at most 8): `4,4165`. */
export function formatDecimal(value: string | null | undefined, locale: string, minimum = 2): string {
  if (value === null || value === undefined || value === "") return "—"
  return new Intl.NumberFormat(toIntlLocale(locale), {
    minimumFractionDigits: minimum,
    maximumFractionDigits: 8,
  }).format(asNumber(value))
}

/** `1 EUR = 4,4165 PLN`. */
export function formatRate(rate: string, target: string, base: string, locale: string): string {
  return `1 ${target.toUpperCase()} = ${formatDecimal(rate, locale)} ${base.toUpperCase()}`
}

/** `+3 %`, `-1,5 %`. */
export function formatPercent(value: string, locale: string): string {
  const text = new Intl.NumberFormat(toIntlLocale(locale), { maximumFractionDigits: 4 }).format(asNumber(value))
  return `${value.startsWith("-") ? "" : "+"}${text} %`
}

/** What an admin typed ("4,25", " 4.25 ") as the API's decimal ("4.25"); null when it is not a number. */
export function parseDecimal(input: string, signed = false): string | null {
  const text = input.trim().replace(/\s/g, "").replace(",", ".")
  const pattern = signed ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/
  return pattern.test(text) ? text : null
}

/** The decimal string for an input field, in the admin's language ("4.25" → "4,25" for pl). */
export function inputDecimal(value: string | null | undefined, locale: string): string {
  if (!value) return ""
  return locale.toLowerCase().startsWith("en") ? value : value.replace(".", ",")
}

/** A country's name in the admin's language: `pl` → "Polska". */
export function countryName(code: string, locale: string): string {
  try {
    return (
      new Intl.DisplayNames([toIntlLocale(locale) ?? "en"], { type: "region" }).of(code.toUpperCase()) ??
      code.toUpperCase()
    )
  } catch {
    return code.toUpperCase()
  }
}
