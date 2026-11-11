import { z } from "@medusajs/framework/zod"

import { DEFAULT_CONSENT } from "./copy"
import { formatIssues } from "./kit/options"
import { type BackInStockPluginOptions, LOCALES, type Locale, type Settings, settingsSchema } from "./options"

/** The single settings row admins edit. */
export const SETTINGS_KEY = "general"

export type EffectiveSettings = Settings & {
  /** Consent text per language with the built-in text filled in. */
  consent: Record<Locale, string>
  /** Settings changed in the admin (top-level keys). */
  overridden: string[]
}

/** Settings from the admin merged over the starting values from the plugin options. */
export function mergeSettings(options: Pick<BackInStockPluginOptions, "settings">, stored: unknown): EffectiveSettings {
  const saved = (stored && typeof stored === "object" ? stored : {}) as Partial<Settings>
  const base = options.settings
  const merged: Settings = {
    ...base,
    ...saved,
    retention: { ...base.retention, ...(saved.retention ?? {}) },
    consentText: { ...base.consentText, ...(saved.consentText ?? {}) },
  }
  // A stored value that no longer validates (e.g. after an upgrade) falls back to the option.
  const valid = settingsSchema.safeParse(merged)
  const settings = valid.success ? valid.data : base
  return {
    ...settings,
    consent: Object.fromEntries(
      LOCALES.map((locale) => [locale, settings.consentText[locale]?.trim() || DEFAULT_CONSENT[locale]])
    ) as Record<Locale, string>,
    overridden: Object.keys(saved),
  }
}

/**
 * What an admin may save: any subset of the settings. Written out without
 * defaults on purpose: zod's `.partial()` keeps defaults, which would store
 * every unsent setting as a change and freeze it.
 */
export const settingsUpdateSchema = z.object({
  minQuantity: z.number().int().min(1).max(100_000).optional(),
  delayMinutes: z.number().int().min(0).max(1440).optional(),
  minGapHours: z.number().int().min(0).max(8760).optional(),
  maxNotifications: z.number().int().min(1).max(100).optional(),
  doubleOptIn: z.boolean().optional(),
  retention: z
    .object({
      unconfirmedDays: z.number().int().min(1).max(365).optional(),
      endedDays: z.number().int().min(1).max(3650).optional(),
      activeDays: z.number().int().min(1).max(3650).optional(),
    })
    .optional(),
  /** Empty texts go back to the default. */
  consentText: z.object({ en: z.string().max(2000).optional(), pl: z.string().max(2000).optional() }).optional(),
})

export function parseSettingsUpdate(
  input: unknown,
  current: unknown
): { value: Partial<Settings> } | { error: string } {
  const result = settingsUpdateSchema.safeParse(input)
  if (!result.success) {
    return { error: formatIssues(result.error.issues) }
  }
  const saved = (current && typeof current === "object" ? current : {}) as Partial<Settings>
  const next: Record<string, unknown> = { ...saved }
  for (const [key, value] of Object.entries(result.data)) {
    if (value === undefined) {
      continue
    }
    if (key === "retention") {
      next.retention = { ...(saved.retention ?? {}), ...(value as object) }
    } else if (key === "consentText") {
      const texts = { ...(saved.consentText ?? {}), ...(value as Record<string, string | undefined>) }
      next.consentText = Object.fromEntries(
        Object.entries(texts).filter(([, text]) => typeof text === "string" && text.trim() !== "")
      )
    } else {
      next[key] = value
    }
  }
  return { value: next as Partial<Settings> }
}
