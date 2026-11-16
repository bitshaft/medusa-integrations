import { toIntlLocale } from "./kit/format"

export { errorMessage } from "./kit/format"

/** The plugin speaks Polish and English; other admin languages get English. */
export const adminLocale = (language: string | undefined): "pl" | "en" =>
  (language ?? "").toLowerCase().startsWith("pl") ? "pl" : "en"

/** `255,00 zł`. Amounts are in major units, like Medusa's API. */
export function money(
  amount: number | null | undefined,
  currency: string | null | undefined,
  language: string
): string {
  if (amount == null) return "—"
  try {
    return new Intl.NumberFormat(toIntlLocale(language) ?? "en-US", {
      style: "currency",
      currency: (currency || "pln").toUpperCase(),
    }).format(amount)
  } catch {
    return amount.toFixed(2)
  }
}

/** `13 lis 2026`. */
export function shortDate(value: string | Date | null | undefined, language: string): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat(toIntlLocale(language) ?? "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

/** `13 lis 2026, 14:05`. */
export function dateTime(value: string | Date | null | undefined, language: string): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat(toIntlLocale(language) ?? "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

/** A localized text in the admin's language, falling back to the other one. */
export const pick = (value: Partial<Record<"pl" | "en", string>> | null | undefined, language: string) =>
  value?.[adminLocale(language)] || value?.pl || value?.en || ""
