import { type EmailLocale, LOCALES } from "../locales"
import { en } from "./en"
import { pl } from "./pl"
import type { CopyDictionary, CopyGroup, CopyOverrides } from "./types"

export * from "./types"

export const DEFAULT_COPY: Record<EmailLocale, CopyDictionary> = { en, pl }

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

/**
 * Text of one group in one language: defaults, then the group's own
 * defaults (custom templates), then the admin's edits. Languages a custom
 * template does not cover fall back to its first language.
 */
export function resolveCopy(
  group: string,
  locale: EmailLocale,
  sources: { custom?: Partial<Record<EmailLocale, CopyGroup>>; overrides?: CopyOverrides } = {}
): CopyGroup {
  const customFallback = sources.custom ? Object.values(sources.custom).find(Boolean) : undefined
  return {
    ...DEFAULT_COPY.en[group],
    ...DEFAULT_COPY[locale][group],
    ...customFallback,
    ...sources.custom?.[locale],
    ...cleanGroup(sources.overrides?.[locale]),
  }
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
}

/**
 * Checks edits before they are saved and returns only real changes: keys
 * must exist, texts must not be too long and may only use known variables.
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

  for (const [locale, group] of Object.entries(input as Record<string, unknown>)) {
    if (!(LOCALES as readonly string[]).includes(locale)) {
      errors.push(`"${locale}" is not a supported language (use ${LOCALES.join(" or ")})`)
      continue
    }
    if (!group || typeof group !== "object") {
      continue
    }
    const base = defaults(locale as EmailLocale)
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
      overrides[locale as EmailLocale] = cleaned
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
