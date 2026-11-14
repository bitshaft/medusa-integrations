import { canonicalLocale, type EmailLocale, languageOf, localizedValue } from "../locales"
import { en } from "./en"
import { pl } from "./pl"
import type { CopyDictionary, CopyGroup, CopyOverrides } from "./types"

export * from "./types"

/** Built-in text, by language (`en`, `pl`). */
export const DEFAULT_COPY: Record<string, CopyDictionary> = { en, pl }

/** Longest text an admin can save for one field. */
export const MAX_COPY_LENGTH = 2000

const VARIABLE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

/** Replaces `{{name}}` with its value. Unknown variables are left as written, so mistakes are visible. */
export function interpolate(text: string, variables: Record<string, string | number | null | undefined>): string {
  return text.replace(VARIABLE, (match, name: string) => {
    const value = variables[name]
    return value === undefined || value === null ? match : String(value)
  })
}

/** Names of the `{{variables}}` used in a text. */
export function variablesIn(text: string): string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((match) => match[1]))]
}

/** Where the text of a group comes from. */
export type CopySources = {
  /** The original language (`defaultLocale` option); every other language falls back to it. */
  base: EmailLocale
  /** Default text of a custom template (`templates` option), per language code. */
  custom?: Partial<Record<string, CopyGroup>>
  /** The admin's edits, per store language code. */
  overrides?: CopyOverrides
}

const sameLocale = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * Default text a language has of its own: the built-in text in that
 * language, then the custom template's. Empty for a language neither covers
 * (it starts untranslated).
 */
export function ownDefaults(group: string, locale: EmailLocale, custom?: CopySources["custom"]): CopyGroup {
  return { ...DEFAULT_COPY[languageOf(locale)]?.[group], ...localizedValue(custom, locale) }
}

/**
 * Default text of a group in one language, as the editor shows it and as
 * edits are compared against. The base always has a text for every field:
 * a base without built-in text uses the English one (or the custom
 * template's English, else first, language).
 */
export function copyDefaults(group: string, locale: EmailLocale, sources: Omit<CopySources, "overrides">): CopyGroup {
  if (!sameLocale(locale, sources.base)) {
    return ownDefaults(group, locale, sources.custom)
  }
  const customFallback = sources.custom
    ? (localizedValue(sources.custom, "en") ?? Object.values(sources.custom).find(Boolean))
    : undefined
  return { ...DEFAULT_COPY.en[group], ...customFallback, ...ownDefaults(group, locale, sources.custom) }
}

/**
 * Text of one group in one language, field by field: the admin's edit in
 * that language, else the language's own default, else the base language's
 * text (its edit, else its default). The fallback is always the configured
 * base, so a half-translated email mixes the translation with the original.
 */
export function resolveCopy(group: string, locale: EmailLocale, sources: CopySources): CopyGroup {
  const original = { ...copyDefaults(group, sources.base, sources), ...cleanGroup(sources.overrides?.[sources.base]) }
  if (sameLocale(locale, sources.base)) {
    return original
  }
  return {
    ...original,
    ...ownDefaults(group, locale, sources.custom),
    ...cleanGroup(sources.overrides?.[locale]),
  }
}

/**
 * Fields of a translation that would go out in the base language: no edit
 * and no default of the language's own. Never any for the base itself.
 */
export function missingFields(keys: string[], group: string, locale: EmailLocale, sources: CopySources): string[] {
  if (sameLocale(locale, sources.base)) {
    return []
  }
  const own = ownDefaults(group, locale, sources.custom)
  const edits = cleanGroup(sources.overrides?.[locale])
  const original = resolveCopy(group, sources.base, sources)
  return keys.filter((key) => !edits[key] && !own[key]?.trim() && Boolean(original[key]?.trim()))
}

/** Interpolates every string of a group. */
export function interpolateGroup(group: CopyGroup, variables: Record<string, string | number | null | undefined>) {
  return Object.fromEntries(Object.entries(group).map(([key, text]) => [key, interpolate(text, variables)]))
}

export type CopyValidationInput = {
  /** Keys the group has. */
  keys: string[]
  /** Variables the group may use; `null` allows any (custom templates). */
  variables: string[] | null
  /** Languages text can be saved in: the store's (base first). */
  locales: string[]
}

/**
 * Checks edits before they are saved and returns only real changes: the
 * language must be a store language, keys must exist, texts must not be too
 * long and may only use known variables.
 * Empty strings and texts equal to the default are dropped, so the default
 * (and its future improvements) keeps applying.
 */
export function validateOverrides(
  input: unknown,
  rules: CopyValidationInput,
  defaults: (locale: EmailLocale) => CopyGroup
): { overrides: CopyOverrides; errors: string[] } {
  const errors: string[] = []
  const overrides: CopyOverrides = {}
  if (!input || typeof input !== "object") {
    return { overrides, errors }
  }

  for (const [given, group] of Object.entries(input as Record<string, unknown>)) {
    const code = canonicalLocale(given)
    const locale = code && rules.locales.find((candidate) => sameLocale(candidate, code))
    if (!locale) {
      errors.push(`"${given}" is not a store language (use ${rules.locales.join(", ")})`)
      continue
    }
    if (!group || typeof group !== "object") {
      continue
    }
    const base = defaults(locale)
    const cleaned: CopyGroup = {}
    for (const [key, value] of Object.entries(group as Record<string, unknown>)) {
      if (!rules.keys.includes(key)) {
        errors.push(`${locale}.${key}: unknown field`)
        continue
      }
      if (typeof value !== "string") {
        errors.push(`${locale}.${key}: expected text`)
        continue
      }
      const text = value.replace(/\r\n/g, "\n").trim()
      if (!text || text === base[key]) {
        continue
      }
      if (text.length > MAX_COPY_LENGTH) {
        errors.push(`${locale}.${key}: longer than ${MAX_COPY_LENGTH} characters`)
        continue
      }
      const unknown = rules.variables ? variablesIn(text).filter((name) => !rules.variables!.includes(name)) : []
      if (unknown.length) {
        errors.push(
          `${locale}.${key}: unknown variable ${unknown.map((name) => `{{${name}}}`).join(", ")}; ` +
            `available: ${rules.variables!.map((name) => `{{${name}}}`).join(", ")}`
        )
        continue
      }
      cleaned[key] = text
    }
    if (Object.keys(cleaned).length) {
      overrides[locale] = cleaned
    }
  }
  return { overrides, errors }
}

function cleanGroup(group: CopyGroup | undefined): CopyGroup {
  if (!group) {
    return {}
  }
  return Object.fromEntries(Object.entries(group).filter(([, text]) => typeof text === "string" && text.trim() !== ""))
}
