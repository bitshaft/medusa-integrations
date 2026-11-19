import { z } from "@medusajs/framework/zod"

import { formatIssues } from "./kit/options"

/** The single settings row admins edit. */
export const SETTINGS_KEY = "general"

/** How the converted amount is rounded, as the last step. */
export const ROUNDINGS = ["none", "whole", "x99", "x49_99", "five", "ten"] as const
export type Rounding = (typeof ROUNDINGS)[number]

/** Where a currency's rate comes from. */
export const RATE_MODES = ["fixed", "api", "api_margin"] as const
export type RateMode = (typeof RATE_MODES)[number]

/**
 * How tax is handled between two tax-inclusive prices: `gross` converts the
 * gross amount as it is; `net` takes the base country's VAT off, converts,
 * and adds the target country's VAT.
 */
export const TAX_MODES = ["gross", "net"] as const
export type TaxMode = (typeof TAX_MODES)[number]

/** A positive decimal written with a dot, e.g. `4.25`. */
const positiveDecimal = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,10})?$/, "expected a positive number like 4.25")
  .refine((value) => Number(value) > 0, "must be greater than 0")

/** A percentage that may be negative, e.g. `3` or `-1.5`, above -100. */
const percent = z
  .string()
  .trim()
  .regex(/^-?\d{1,3}(\.\d{1,4})?$/, "expected a percentage like 3 or -1.5")
  .refine((value) => Number(value) > -100 && Number(value) <= 500, "must be between -99.99 and 500")

const countryCode = z
  .string()
  .trim()
  .regex(/^[a-zA-Z]{2}$/, "expected a two-letter country code")
  .transform((value) => value.toLowerCase())

const currencyCode = z
  .string()
  .trim()
  .regex(/^[a-zA-Z]{3}$/, "expected a three-letter currency code")
  .transform((value) => value.toLowerCase())

/** The rules for one target currency. */
export const currencyRuleSchema = z.object({
  /** Off: the currency is never filled. */
  enabled: z.boolean().default(true),
  mode: z.enum(RATE_MODES).default("api"),
  /** For `fixed`: how much of the base currency one unit of this currency is worth (1 EUR = 4.00 PLN → "4.00"). */
  fixedRate: positiveDecimal.nullable().default(null),
  /** For `api_margin`: added to the converted price, in percent; negative lowers it. */
  marginPercent: percent.default("0"),
  rounding: z.enum(ROUNDINGS).default("none"),
  tax: z.enum(TAX_MODES).default("gross"),
  /** The country whose VAT rate this currency's prices carry. Null: the first country of its first region. */
  taxCountry: countryCode.nullable().default(null),
})

export type CurrencyRule = z.output<typeof currencyRuleSchema>

export const settingsSchema = z.object({
  /** Null: the store's default currency. */
  baseCurrency: currencyCode.nullable().default(null),
  /** The country whose VAT rate the base prices carry. Null: the first country of the base currency's region. */
  baseTaxCountry: countryCode.nullable().default(null),
  /** Rules per target currency (lowercase code). A store currency missing here gets the default rule. */
  currencies: z.record(z.string(), currencyRuleSchema).default({}),
})

export type Settings = z.output<typeof settingsSchema>

export const DEFAULT_RULE: CurrencyRule = currencyRuleSchema.parse({})

/** The stored settings, or the defaults when nothing (or nothing valid any more) is stored. */
export function readSettings(stored: unknown): Settings {
  const parsed = settingsSchema.safeParse(stored ?? {})
  return parsed.success ? parsed.data : settingsSchema.parse({})
}

/** The rule for a target currency: the saved one, else the default. */
export function ruleFor(settings: Settings, code: string): CurrencyRule {
  return settings.currencies[code.toLowerCase()] ?? DEFAULT_RULE
}

/**
 * What an admin saves: the whole settings object. A fixed rate is required
 * where the mode is `fixed`, so a saved rule can always be applied.
 */
export function parseSettingsUpdate(input: unknown): { value: Settings } | { error: string } {
  const result = settingsSchema.safeParse(input)
  if (!result.success) {
    return { error: formatIssues(result.error.issues) }
  }
  const currencies: Record<string, CurrencyRule> = {}
  for (const [code, rule] of Object.entries(result.data.currencies)) {
    if (!/^[a-zA-Z]{3}$/.test(code)) {
      return { error: `currencies.${code}: expected a three-letter currency code` }
    }
    if (rule.mode === "fixed" && !rule.fixedRate) {
      return { error: `currencies.${code}.fixedRate: is required for a fixed rate` }
    }
    currencies[code.toLowerCase()] = rule
  }
  return { value: { ...result.data, currencies } }
}
