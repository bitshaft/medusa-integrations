/** Languages the built-in templates are written in. */
export const LOCALES = ["en", "pl"] as const

export type EmailLocale = (typeof LOCALES)[number]

/** `pl-PL`, `PL`, `pl_PL` → `pl`. Returns undefined for unsupported languages. */
export function normalizeLocale(value: unknown): EmailLocale | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const language = value.trim().toLowerCase().split(/[-_]/)[0]
  return (LOCALES as readonly string[]).includes(language) ? (language as EmailLocale) : undefined
}

/** The first supported locale among the candidates, otherwise the fallback. */
export function pickLocale(candidates: unknown[], fallback: EmailLocale): EmailLocale {
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate)
    if (locale) {
      return locale
    }
  }
  return fallback
}

/** BCP 47 tag for `Intl` formatting. */
export function intlLocale(locale: EmailLocale): string {
  return locale === "pl" ? "pl-PL" : "en-GB"
}
