import { z } from "@medusajs/framework/zod"

import { DEFAULT_TIME_ZONE } from "./format"
import { parsePluginOptions, type PluginOptionsResult } from "./kit/options"
import type { Locale } from "./types"

/** Name used in log lines and errors. */
export const PLUGIN_NAME = "coupons"
export const PACKAGE_NAME = "@bitshaft/medusa-plugin-coupons"

const timeZone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value })
    return true
  } catch {
    return false
  }
}, "must be an IANA time zone such as Europe/Warsaw")

/** Values the admin can change on the Settings tab; these are the starting values. */
export const settingsSchema = z.object({
  /** Currency of new fixed-amount coupons and of minimum baskets. */
  currencyCode: z
    .string()
    .regex(/^[a-zA-Z]{3}$/, "must be a three-letter currency code")
    .transform((value) => value.toLowerCase())
    .default("pln"),
  /** Length of random codes in batches (without the prefix). */
  codeLength: z.number().int().min(6).max(20).default(10),
  /** Language of the one-sentence summary in CSV exports. */
  exportLocale: z.enum(["pl", "en"]).default("pl"),
})
export type CouponSettings = z.output<typeof settingsSchema>

export const pluginOptionsSchema = z.object({
  /** Store time zone: coupon dates are shown and "ends in 7 days" is counted in it. */
  timeZone: timeZone.default(DEFAULT_TIME_ZONE),
  /** Language of customer-facing messages when the request names none. */
  defaultLocale: z.enum(["pl", "en"]).default("pl"),
  /** Most codes one batch may create. */
  maxBatchSize: z.number().int().min(1).max(20_000).default(5_000),
  /** Requests per minute one visitor may make to `/store/coupons/check`, against guessing codes. */
  checkRateLimitPerMinute: z.number().int().min(1).max(1_000).default(20),
  // `prefault`, not `default`: zod 4 returns a `default` value as-is, without the inner defaults.
  settings: settingsSchema.prefault({}),
  /**
   * Demo mode: the admin gets "Restore test data", which (re)creates a set
   * of demo coupons (names starting with "[Demo]", codes with "DEMO-") as
   * real Medusa promotions. Real coupons are never touched.
   */
  demo: z.boolean().default(false),
})
export type CouponsPluginOptions = z.output<typeof pluginOptionsSchema>

/** No option is required: with none at all the plugin runs with the defaults above. */
export function parseOptions(raw: unknown): PluginOptionsResult<CouponsPluginOptions> {
  return parsePluginOptions(pluginOptionsSchema, raw)
}

export function normalizeLocale(value: unknown, fallback: Locale): Locale {
  if (typeof value !== "string") return fallback
  const lang = value.trim().toLowerCase().slice(0, 2)
  return lang === "pl" || lang === "en" ? lang : fallback
}
