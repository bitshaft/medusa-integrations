import { z } from "@medusajs/framework/zod"

import { parsePluginOptions, type PluginOptionsResult } from "./kit/options"

/** Name used in log lines and errors. */
export const PLUGIN_NAME = "olx"
export const PACKAGE_NAME = "@bitshaft/medusa-plugin-olx"

/** Options the plugin cannot talk to OLX without (not needed in demo mode). */
export const REQUIRED_OPTIONS = ["clientId", "clientSecret", "redirectUri", "encryptionKey"] as const

export const pluginOptionsSchema = z.object({
  /** Sample categories and an in-memory OLX: everything works, nothing leaves the store. */
  demo: z.boolean().default(false),
  /** From the app registered on developer.olx.pl. */
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  /** Must equal the Redirect URI of the OLX app: `https://<backend>/hooks/olx/oauth/callback`. */
  redirectUri: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"), "must be an https:// address (OLX refuses others)")
    .optional(),
  /** Encrypts the OLX tokens in the database. At least 32 characters; changing it means connecting again. */
  encryptionKey: z.string().min(32, "must have at least 32 characters").optional(),
  /** Where the browser returns after connecting. Default: `/app/olx` on the backend of `redirectUri`. */
  adminUrl: z.string().url().optional(),
  /** OLX's address; change it only for a proxy or a test server. */
  baseUrl: z.string().url().default("https://www.olx.pl"),
  /** Per request. */
  timeoutMs: z.number().int().min(1000).max(60_000).default(15_000),
})

export type OlxPluginOptionsInput = z.input<typeof pluginOptionsSchema>
export type OlxPluginOptions = z.output<typeof pluginOptionsSchema>

/** Validates raw plugin options without throwing. Demo mode needs no credentials. */
export function parseOptions(raw: unknown): PluginOptionsResult<OlxPluginOptions> {
  const demo = Boolean(raw && typeof raw === "object" && (raw as { demo?: unknown }).demo === true)
  return parsePluginOptions(pluginOptionsSchema, raw, { required: demo ? [] : [...REQUIRED_OPTIONS] })
}

/** Where to send the browser after the OLX consent screen. A fixed address, never one from the request. */
export function adminReturnUrl(options: OlxPluginOptions): string {
  if (options.adminUrl) {
    return options.adminUrl
  }
  return options.redirectUri ? `${new URL(options.redirectUri).origin}/app/olx` : "/app/olx"
}
