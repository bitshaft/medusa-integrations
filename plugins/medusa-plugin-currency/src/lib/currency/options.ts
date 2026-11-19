import { z } from "@medusajs/framework/zod"

import { parsePluginOptions, type PluginOptionsResult } from "./kit/options"

/** Name used in log lines and errors. */
export const PLUGIN_NAME = "currency"
export const PACKAGE_NAME = "@bitshaft/medusa-plugin-currency"

/** Exchange rate sources this version ships. Each is a `RateProvider` (see `rates/`). */
export const PROVIDERS = ["nbp"] as const
export type ProviderId = (typeof PROVIDERS)[number]

export const pluginOptionsSchema = z.object({
  /**
   * Sample rates and sample products: the whole preview works, nothing asks
   * the rate source and nothing is written to prices.
   */
  demo: z.boolean().default(false),
  /** Where exchange rates come from. `nbp`: the National Bank of Poland, table A. */
  provider: z.enum(PROVIDERS).default("nbp"),
  nbp: z
    .object({
      /** The API's address; change it only for a proxy or a test server. */
      baseUrl: z.string().url().default("https://api.nbp.pl/api"),
      /** Per request. */
      timeoutMs: z.number().int().min(1000).max(60_000).default(10_000),
    })
    .default({ baseUrl: "https://api.nbp.pl/api", timeoutMs: 10_000 }),
  /** Most variants one fill may cover (a whole category can be large). */
  maxVariants: z.number().int().min(1).max(20_000).default(2000),
})

export type CurrencyPluginOptionsInput = z.input<typeof pluginOptionsSchema>
export type CurrencyPluginOptions = z.output<typeof pluginOptionsSchema>

/**
 * Validates raw plugin options without throwing. Nothing is required: with
 * no options the plugin works with NBP rates.
 */
export function parseOptions(raw: unknown): PluginOptionsResult<CurrencyPluginOptions> {
  return parsePluginOptions(pluginOptionsSchema, raw)
}
