import { toIntlLocale } from "./kit/format"

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

/** `1255` / `12 555` points, with the locale's separators. */
export const points = (value: number, language: string) =>
  new Intl.NumberFormat(toIntlLocale(language) ?? "en-US").format(value)

/** A random id for forms, so a double submit is written once. */
export const requestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** A tier id from its name: "Złoto VIP" → "zloto-vip". */
export function slug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/ł/gi, "l")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "tier"
  )
}
