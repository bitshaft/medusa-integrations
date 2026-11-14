/** Languages the built-in templates are written in. Other languages start empty and fall back to the base. */
export const BUILT_IN_LANGUAGES = ["en", "pl"] as const

/** A BCP 47 language tag in canonical form, e.g. `pl-PL` or `en`. */
export type EmailLocale = string

/** The languages emails are written and sent in. */
export type EmailLanguages = {
  /** The original language (`defaultLocale` option): texts fall back to it, store team emails use it. */
  base: EmailLocale
  /** The base first, then the store's other languages. Only the base when translation is off. */
  locales: EmailLocale[]
  /** Medusa's Translation module is installed, so the store's languages apply. */
  translation: boolean
}

/** `pl_pl`, `PL-pl` → `pl-PL`. Undefined for anything that is not a language tag. */
export function canonicalLocale(value: unknown): EmailLocale | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const tag = value.trim().replace(/_/g, "-")
  if (!tag || tag.length > 35) {
    return undefined
  }
  try {
    return Intl.getCanonicalLocales(tag)[0]
  } catch {
    return undefined
  }
}

/** `pl-PL` → `pl`. */
export function languageOf(locale: string): string {
  return locale.split(/[-_]/)[0].toLowerCase()
}

/**
 * The entry of `locales` a candidate means: the same code, else the bare
 * language (`en` for `en-US`), else the first one in the same language.
 * Undefined when nothing matches.
 */
export function matchLocale(candidate: unknown, locales: readonly string[]): string | undefined {
  const code = canonicalLocale(candidate)
  if (!code) {
    return undefined
  }
  const normalized = locales.map((locale) => (canonicalLocale(locale) ?? locale).toLowerCase())
  const exact = normalized.indexOf(code.toLowerCase())
  if (exact !== -1) {
    return locales[exact]
  }
  const language = languageOf(code)
  const bare = normalized.indexOf(language)
  if (bare !== -1) {
    return locales[bare]
  }
  const same = normalized.findIndex((locale) => languageOf(locale) === language)
  return same === -1 ? undefined : locales[same]
}

/** The store language of the first candidate that has one, otherwise the base. */
export function pickLocale(candidates: unknown[], languages: EmailLanguages): EmailLocale {
  for (const candidate of candidates) {
    const locale = matchLocale(candidate, languages.locales)
    if (locale) {
      return locale
    }
  }
  return languages.base
}

/** A value kept per language (`{ en: …, "pl-PL": … }`) for one language, matched like `matchLocale`. */
export function localizedValue<T>(values: Partial<Record<string, T>> | undefined, locale: string): T | undefined {
  if (!values) {
    return undefined
  }
  const key = matchLocale(locale, Object.keys(values))
  return key === undefined ? undefined : values[key]
}

/** Formats bare `en` and `pl` the way the built-in emails always did. */
const INTL_DEFAULTS: Record<string, string> = { en: "en-GB", pl: "pl-PL" }

/** BCP 47 tag for `Intl` formatting. */
export function intlLocale(locale: EmailLocale): string {
  return INTL_DEFAULTS[locale.toLowerCase()] ?? canonicalLocale(locale) ?? "en-GB"
}
