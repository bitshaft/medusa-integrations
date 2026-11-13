/**
 * Turns an admin language code into a locale `Intl` accepts. The Medusa admin
 * uses codes such as "enGB", "ptBR" or "zhCN", which are not BCP 47 tags and
 * make `Intl` throw a RangeError. "enGB" becomes "en-GB"; a code `Intl` still
 * rejects falls back to the browser's default locale (`undefined`).
 */
export function toIntlLocale(locale: string | null | undefined): string | undefined {
  if (!locale) {
    return undefined
  }
  const tag = locale.replace(/^([a-z]{2,3})([A-Z]{2}|[A-Z][a-z]{3})$/, "$1-$2")
  try {
    return Intl.getCanonicalLocales(tag)[0]
  } catch {
    return undefined
  }
}

/** `—` for empty values, otherwise a localized date and time. */
export function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) {
    return "—"
  }
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

/** Formats an amount in minor units (cents, grosze) in the given currency. */
export function formatMinorUnits(value: number | null | undefined, currency: string, locale: string): string {
  if (value === null || value === undefined) {
    return "—"
  }
  return new Intl.NumberFormat(toIntlLocale(locale), { style: "currency", currency }).format(value / 100)
}

/** Pulls a readable message out of a js-sdk FetchError or any error. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}
