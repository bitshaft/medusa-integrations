import { z } from "@medusajs/framework/zod"

import { parsePluginOptions, type PluginOptionsResult } from "./kit/options"

export const PLUGIN_NAME = "stripe"
export const PACKAGE_NAME = "@bitshaft/medusa-plugin-stripe"

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
  .pipe(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "must be a domain such as sklep.pl"))

export const pluginOptionsSchema = z.object({
  /** Stripe secret or (recommended) restricted key. Only sent in the Authorization header. */
  apiKey: z.string().trim().optional(),
  /** Sample data everywhere and no request to Stripe at all. */
  demo: z.boolean().default(false),
  /** The `id` of the official Stripe provider in medusa-config (registered as `pp_stripe_<id>`). */
  providerId: z.string().trim().min(1).default("stripe"),
  /** Public URL of the backend, for the webhook check (when the admin runs on another address). */
  backendUrl: z
    .string()
    .trim()
    .url()
    .transform((v) => v.replace(/\/+$/, ""))
    .optional(),
  /** Storefront domains checked for Apple Pay and Google Pay. */
  storefrontDomains: z.array(domain).default([]),
  /** How long Stripe answers are reused. */
  cacheSeconds: z.number().int().min(0).max(3600).default(300),
  /** Expected key mode; without it: live when NODE_ENV=production, else test. */
  mode: z.enum(["live", "test"]).optional(),
  /** A successful payment without an order is flagged only after this many minutes. */
  orphanGraceMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 14)
    .default(30),
})
export type StripePluginOptions = z.output<typeof pluginOptionsSchema>

/** `apiKey` is required unless demo mode is on. */
export function parseOptions(raw: unknown): PluginOptionsResult<StripePluginOptions> {
  const demo = Boolean(raw && typeof raw === "object" && (raw as { demo?: unknown }).demo === true)
  return parsePluginOptions(pluginOptionsSchema, raw, { required: demo ? [] : ["apiKey"] })
}
