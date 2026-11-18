import { z } from "@medusajs/framework/zod"

import { DEFAULT_TIME_ZONE } from "./format"
import { parsePluginOptions, type PluginOptionsResult } from "./kit/options"

export const PLUGIN_NAME = "loyalty"
export const PACKAGE_NAME = "@bitshaft/medusa-plugin-loyalty"

const timeZone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value })
    return true
  } catch {
    return false
  }
}, "must be an IANA time zone such as Europe/Warsaw")

/**
 * Technical options only. Every rule of the program (rates, actions, tiers,
 * expiry, rewards) is a setting the owner edits in the admin.
 */
export const pluginOptionsSchema = z.object({
  /** Birthdays, "today" and dates in exports use this time zone. */
  timeZone: timeZone.default(DEFAULT_TIME_ZONE),
  /** Language of customer messages when the request names none. */
  defaultLocale: z.enum(["pl", "en"]).default("pl"),
  /**
   * Demo mode: the admin gets "Restore test data", which replaces the whole
   * program with sample settings, rewards and a year of history. For demo
   * stores only: it deletes every loyalty record.
   */
  demo: z.boolean().default(false),
})
export type LoyaltyPluginOptions = z.output<typeof pluginOptionsSchema>

/** No option is required. */
export function parseOptions(raw: unknown): PluginOptionsResult<LoyaltyPluginOptions> {
  return parsePluginOptions(pluginOptionsSchema, raw)
}
