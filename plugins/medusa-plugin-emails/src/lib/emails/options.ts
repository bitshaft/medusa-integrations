import { z } from "@medusajs/framework/zod"

import { parsePluginOptions, type PluginOptionsResult } from "./kit/options"
import { type EmailLocale, LOCALES } from "./locales"
import type { AttachmentResolver, Brand, CustomTemplateOption } from "./types"

/** Name used in log lines and errors. */
export const PLUGIN_NAME = "emails"
export const PACKAGE_NAME = "@bitshaft/medusa-plugin-emails"

/* ------------------------------------------------------------------------ */
/* Schema                                                                    */
/* ------------------------------------------------------------------------ */

const locale = z.enum(LOCALES)
const color = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "Expected a hex color like #1f2937")
/** One text for every language, or one per language. */
const localized = z.union([z.string(), z.object({ en: z.string().optional(), pl: z.string().optional() })])
const emailAddress = z.string().email()
/** `orders@shop.pl` or `Shop <orders@shop.pl>`. */
const sender = z.string().regex(/^(?:[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+|[^<>]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>)$/, {
  message: 'Expected "orders@shop.pl" or "Shop <orders@shop.pl>"',
})
const fn = <T>() => z.custom<T>((value) => typeof value === "function", "Expected a function")

const brandSchema = z.object({
  /** Store name used in texts. Defaults to the store's name in Medusa. */
  name: z.string().min(1).optional(),
  /** Absolute URL of the logo (PNG or JPG; many mail clients block SVG). */
  logoUrl: z.string().url().optional(),
  logoWidth: z.number().int().positive().max(600).default(140),
  colors: z
    .object({
      /** Buttons and links. */
      primary: color.default("#18181b"),
      primaryText: color.default("#ffffff"),
      background: color.default("#f4f4f5"),
      card: color.default("#ffffff"),
      text: color.default("#18181b"),
      muted: color.default("#71717a"),
      border: color.default("#e4e4e7"),
    })
    .default({
      primary: "#18181b",
      primaryText: "#ffffff",
      background: "#f4f4f5",
      card: "#ffffff",
      text: "#18181b",
      muted: "#71717a",
      border: "#e4e4e7",
    }),
  /** Extra line in the footer, e.g. a legal note. */
  footerText: localized.optional(),
  /** Company details printed in the footer. */
  company: z
    .object({
      name: z.string().optional(),
      address: z.string().optional(),
      taxId: z.string().optional(),
      phone: z.string().optional(),
      email: emailAddress.optional(),
    })
    .default({}),
  links: z
    .object({
      website: z.string().url().optional(),
      terms: z.string().url().optional(),
      returns: z.string().url().optional(),
      privacy: z.string().url().optional(),
    })
    .default({}),
  /** Shown in "Questions?" lines. Defaults to `replyTo`, then the `from` address. */
  supportEmail: emailAddress.optional(),
})

/**
 * URL templates. Placeholders in `{braces}` are URL-encoded values:
 * `{storefrontUrl}`, `{adminUrl}`, `{locale}`, plus the ones listed per URL.
 */
const urlsSchema = z.object({
  /** `{order_id}`, `{display_id}`, `{country_code}`, `{email}` */
  order: z.string().default("{storefrontUrl}/{country_code}/order/{order_id}/confirmed"),
  store: z.string().default("{storefrontUrl}"),
  /** `{token}`, `{email}` */
  passwordReset: z.string().default("{storefrontUrl}/reset-password?token={token}&email={email}"),
  /** `{code}`, `{email}` */
  emailVerification: z.string().default("{storefrontUrl}/verify-email?code={code}&email={email}"),
  /** `{order_id}` */
  adminOrder: z.string().default("{adminUrl}/orders/{order_id}"),
  adminInventory: z.string().default("{adminUrl}/inventory"),
  /** `{token}`, `{email}`; for admin users who reset their password. */
  adminPasswordReset: z.string().default("{adminUrl}/reset-password?token={token}&email={email}"),
})

export const pluginOptionsSchema = z.object({
  /* Sending --------------------------------------------------------------- */
  /** Sender of every email: `orders@shop.pl` or `Shop <orders@shop.pl>`. */
  from: sender,
  replyTo: emailAddress.optional(),
  /** Notification channel the emails are sent on. */
  channel: z.string().min(1).default("email"),
  /**
   * Render and log emails without sending anything. The send log shows them
   * with the status `demo`.
   */
  demo: z.boolean().default(false),

  /* Language -------------------------------------------------------------- */
  /** Used when the customer's language is unknown, and for store team emails. */
  defaultLocale: locale.default("en"),
  /** Language by shipping country (ISO alpha-2), used when the order has no locale. */
  localeByCountry: z.record(z.string(), locale).default({ pl: "pl" }),

  /* Links ----------------------------------------------------------------- */
  /** Public URL of the storefront, e.g. `https://shop.pl`. Buttons are hidden without it. */
  storefrontUrl: z.string().url().optional(),
  /** URL of the Medusa admin, e.g. `https://api.shop.pl/app`. Used in store team emails. */
  adminUrl: z.string().url().optional(),
  urls: urlsSchema.default(urlsSchema.parse({})),

  /* Look ------------------------------------------------------------------ */
  brand: brandSchema.default(brandSchema.parse({})),

  /* Defaults admins can change on the settings page ------------------------ */
  team: z
    .object({
      /** Who gets store team alerts until recipients are set in the admin. */
      recipients: z.array(emailAddress).default([]),
    })
    .default({ recipients: [] }),
  lowStock: z
    .object({
      /** Alert when an item has this many units or fewer available. */
      threshold: z.number().int().nonnegative().default(5),
    })
    .default({ threshold: 5 }),
  /** Email types that start switched off. */
  disabledTypes: z.array(z.string()).default([]),

  /* Reliability ----------------------------------------------------------- */
  retries: z
    .object({
      /** Total attempts per email, including the first one. */
      maxAttempts: z.number().int().min(1).max(10).default(5),
    })
    .default({ maxAttempts: 5 }),

  /* Extension points ------------------------------------------------------ */
  /** Replace built-in templates or add your own email types, keyed by type. */
  templates: z
    .record(
      z.string(),
      z.custom<CustomTemplateOption>((value) => !!value && typeof value === "object")
    )
    .default({}),
  /**
   * Files to attach, e.g. an invoice PDF. One resolver for every email, or
   * one per email type.
   */
  attachments: z.union([fn<AttachmentResolver>(), z.record(z.string(), fn<AttachmentResolver>())]).optional(),
})

export type EmailsPluginOptionsInput = z.input<typeof pluginOptionsSchema>
export type EmailsPluginOptions = z.output<typeof pluginOptionsSchema>

/* ------------------------------------------------------------------------ */
/* Resolution                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Validates raw plugin options without throwing. A missing `from` address or
 * invalid options leave the plugin disabled, so Medusa still starts.
 */
export function parseOptions(raw: unknown): PluginOptionsResult<EmailsPluginOptions> {
  return parsePluginOptions(pluginOptionsSchema, raw, { required: ["from"] })
}

/** The address part of `Shop <orders@shop.pl>`. */
export function addressOf(senderValue: string): string {
  const match = /<([^<>]+)>\s*$/.exec(senderValue)
  return (match ? match[1] : senderValue).trim()
}

/** Brand settings for one language, with the store name filled in. */
export function resolveBrand(options: EmailsPluginOptions, language: EmailLocale, storeName?: string | null): Brand {
  const { brand } = options
  const footerText = typeof brand.footerText === "string" ? brand.footerText : brand.footerText?.[language]
  const name = brand.name ?? (storeName?.trim() || brand.company.name || "Store")
  return {
    name,
    logoUrl: brand.logoUrl,
    logoWidth: brand.logoWidth,
    colors: brand.colors,
    footerText: footerText || undefined,
    company: brand.company,
    links: { ...brand.links, website: brand.links.website ?? options.storefrontUrl },
    supportEmail: brand.supportEmail ?? options.replyTo ?? addressOf(options.from),
  }
}

/**
 * Builds a URL from one of the `urls` templates. Returns undefined when the
 * template needs a value that is not available (e.g. `storefrontUrl` is not
 * set), so callers can hide the button instead of linking nowhere.
 */
export function buildUrl(
  options: EmailsPluginOptions,
  name: string,
  values: Record<string, string | number | null | undefined> = {}
): string | undefined {
  const template = (options.urls as Record<string, string | undefined>)[name]
  if (!template) {
    return undefined
  }
  const base: Record<string, string | undefined> = {
    storefrontUrl: options.storefrontUrl?.replace(/\/+$/, ""),
    adminUrl: options.adminUrl?.replace(/\/+$/, ""),
  }
  let missing = false
  const url = template.replace(/\{([a-zA-Z_]+)\}/g, (_match, key: string) => {
    if (key in base) {
      if (!base[key]) {
        missing = true
      }
      return base[key] ?? ""
    }
    const value = values[key]
    if (value === undefined || value === null || value === "") {
      missing = true
      return ""
    }
    return encodeURIComponent(String(value))
  })
  return missing ? undefined : url
}
