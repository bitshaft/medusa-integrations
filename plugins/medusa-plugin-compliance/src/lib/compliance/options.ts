import { z } from "@medusajs/framework/zod"

import { DEFAULT_TIME_ZONE } from "./format"
import { parsePluginOptions, type PluginOptionsResult } from "./kit/options"

export const PLUGIN_NAME = "compliance"
export const PACKAGE_NAME = "@bitshaft/medusa-plugin-compliance"

const timeZone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value })
    return true
  } catch {
    return false
  }
}, "must be an IANA time zone such as Europe/Warsaw")

/**
 * A module of another plugin (or of the app) that adds its data to a GDPR
 * export: `container.resolve(module)[method](customerId)` must return a
 * JSON-serialisable object or array. See "Data providers" in the README.
 */
export const dataProviderSchema = z.object({
  /** Container key of the module, e.g. "loyalty". */
  module: z.string().trim().min(1),
  /** Method on that module's service, e.g. "exportCustomerData". */
  method: z.string().trim().min(1),
  /** Section name in the export; defaults to the module key. */
  label: z.string().trim().min(1).max(60).optional(),
})
export type DataProvider = z.output<typeof dataProviderSchema>

/**
 * Technical options only. Every rule (modules, periods, consent types,
 * anonymisation scope) is a setting the owner edits in the admin.
 */
export const pluginOptionsSchema = z.object({
  timeZone: timeZone.default(DEFAULT_TIME_ZONE),
  /** Language of customer messages when the request names none. */
  defaultLocale: z.enum(["pl", "en"]).default("pl"),
  dataProviders: z.array(dataProviderSchema).default([]),
})
export type CompliancePluginOptions = z.output<typeof pluginOptionsSchema>

/** No option is required. */
export function parseOptions(raw: unknown): PluginOptionsResult<CompliancePluginOptions> {
  return parsePluginOptions(pluginOptionsSchema, raw)
}
