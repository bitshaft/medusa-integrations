import { z } from "@medusajs/framework/zod"

import { parsePluginOptions, type PluginOptionsResult } from "./kit/options"

/** Name used in log lines and errors. */
export const PLUGIN_NAME = "whitelist-vat"
export const PACKAGE_NAME = "@bitshaft/medusa-plugin-whitelist-vat"

/**
 * Verdicts a store may refuse at checkout. `unverified` is not among them
 * on purpose: a register being down must never turn a buyer away.
 */
const rejectable = z.enum(["invalid", "not_found", "unregistered", "inactive"])

export const pluginOptionsSchema = z.object({
  /** How long an answer is reused before the registers are asked again. The white list is valid per day. */
  cacheTtlHours: z.number().positive().max(720).default(24),
  /** Per request to a register. A slow register counts as unavailable, it does not hold up checkout. */
  timeoutMs: z.number().int().min(1000).max(60_000).default(8000),
  /** Country assumed for numbers typed without a prefix when the billing country is unknown. */
  defaultCountry: z.string().length(2).default("PL"),

  /* Registers ------------------------------------------------------------- */
  /** Ministry of Finance white list of VAT payers. No key needed. */
  mf: z
    .object({
      enabled: z.boolean().default(true),
      environment: z.enum(["production", "test"]).default("production"),
      baseUrl: z.string().url().optional(),
      /**
       * Requests per day the plugin allows itself. The register permits
       * about 100; once this many were made today, it is skipped until
       * midnight (Polish time) instead of being blocked by the ministry.
       */
      dailyLimit: z.number().int().min(1).max(10_000).default(95),
    })
    .default({ enabled: true, environment: "production", dailyLimit: 95 }),
  /** VIES, the EU's VAT number validation. No key needed. */
  vies: z
    .object({
      enabled: z.boolean().default(true),
      /** Your own EU VAT number (e.g. `PL5260250274`). With it VIES issues a consultation number as proof. */
      requesterVatNumber: z
        .string()
        .regex(
          /^[A-Za-z]{2}[A-Za-z0-9+* .-]{2,14}$/,
          "Expected an EU VAT number with its country prefix, e.g. PL5260250274"
        )
        .optional(),
      baseUrl: z.string().url().optional(),
    })
    .default({ enabled: true }),
  /** GUS REGON register (BIR1.1). Used only when `apiKey` is set; each store needs its own key. */
  gus: z
    .object({
      apiKey: z.string().min(1).optional(),
      environment: z.enum(["production", "test"]).default("production"),
      url: z.string().url().optional(),
    })
    .default({ environment: "production" }),

  /* Where the tax ID is --------------------------------------------------- */
  /**
   * Metadata keys that may hold the buyer's tax ID, in order. They are read
   * from the billing address, the shipping address, the cart or order, and
   * the customer.
   */
  taxIdKeys: z.array(z.string().min(1)).min(1).default(["vat_number", "nip", "tax_id", "vat_id"]),

  /* Behaviour ------------------------------------------------------------- */
  orders: z
    .object({
      /** Verify the buyer's tax ID when an order is placed and keep the answers as proof. */
      verifyOnPlaced: z.boolean().default(true),
    })
    .default({ verifyOnPlaced: true }),
  checkout: z
    .object({
      /** Refuse to complete a cart whose tax ID has one of `rejectStatuses`. Off by default. */
      rejectOnCompletion: z.boolean().default(false),
      rejectStatuses: z.array(rejectable).default(["invalid", "not_found"]),
    })
    .default({ rejectOnCompletion: false, rejectStatuses: ["invalid", "not_found"] }),
  /** The public `/store/whitelist-vat/verify` route for storefronts. */
  store: z
    .object({
      enabled: z.boolean().default(true),
      /** Lookups one visitor (IP address) may make per minute. */
      rateLimitPerMinute: z.number().int().min(1).max(600).default(10),
    })
    .default({ enabled: true, rateLimitPerMinute: 10 }),
})

export type WhitelistVatPluginOptionsInput = z.input<typeof pluginOptionsSchema>
export type WhitelistVatPluginOptions = z.output<typeof pluginOptionsSchema>

/**
 * Validates raw plugin options without throwing. Nothing is required (the
 * white list and VIES need no keys), so the plugin works on install; invalid
 * options leave it disabled and Medusa still starts.
 */
export function parseOptions(raw: unknown): PluginOptionsResult<WhitelistVatPluginOptions> {
  return parsePluginOptions(pluginOptionsSchema, raw)
}
