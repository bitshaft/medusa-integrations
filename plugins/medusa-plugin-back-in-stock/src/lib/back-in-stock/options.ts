import { z } from "@medusajs/framework/zod"

import { parsePluginOptions, type PluginOptionsResult } from "./kit/options"

/** Name used in log lines and errors. */
export const PLUGIN_NAME = "back-in-stock"
export const PACKAGE_NAME = "@bitshaft/medusa-plugin-back-in-stock"

/** Languages this plugin's own texts (pages, consent, built-in email) are written in. */
export const LOCALES = ["en", "pl"] as const
export type Locale = (typeof LOCALES)[number]

/** A BCP 47 language tag such as `pl-PL` or `en`, stored in canonical form. */
const localeTag = z.string().transform((value, context) => {
  const code = canonicalLocale(value)
  if (!code) {
    context.addIssue({ code: "custom", message: 'Expected a language tag like "pl-PL" or "en"' })
    return z.NEVER
  }
  return code
})

const localized = z.object({ en: z.string().min(1).optional(), pl: z.string().min(1).optional() })

/**
 * Starting values of the settings admins can change on the plugin's page.
 * Once an admin saves a value, the saved one wins.
 */
export const settingsSchema = z.object({
  /** Units that must be available for a variant to count as back in stock. */
  minQuantity: z.number().int().min(1).max(100_000).default(1),
  /**
   * Minutes to wait after a stock change before checking and sending, so a
   * stock entry mistake that is corrected quickly sends nothing.
   */
  delayMinutes: z.number().int().min(0).max(1440).default(5),
  /** Hours that must pass before the same subscription is notified again. */
  minGapHours: z.number().int().min(0).max(8760).default(24),
  /** Notifications one subscription may receive in total. */
  maxNotifications: z.number().int().min(1).max(100).default(5),
  /** Ask for confirmation by email before a subscription becomes active. */
  doubleOptIn: z.boolean().default(false),
  retention: z
    .object({
      /** Unconfirmed subscriptions are deleted after this many days. */
      unconfirmedDays: z.number().int().min(1).max(365).default(7),
      /** Ended subscriptions lose their email address and tokens after this many days. */
      endedDays: z.number().int().min(1).max(3650).default(180),
      /** Active subscriptions expire after this many days. */
      activeDays: z.number().int().min(1).max(3650).default(365),
    })
    .default({ unconfirmedDays: 7, endedDays: 180, activeDays: 365 }),
  /** Consent text shown next to the form. Defaults to the built-in text. */
  consentText: localized.default({}),
})

export type Settings = z.output<typeof settingsSchema>

export const pluginOptionsSchema = z
  .object({
    /**
     * Public URL of the Medusa backend, e.g. `https://api.shop.pl`. Confirm and
     * unsubscribe links in emails point at its `/hooks/back-in-stock/…` pages,
     * unless `urls.confirm` and `urls.unsubscribe` send people to the storefront.
     */
    backendUrl: z.string().url().optional(),
    /** Public URL of the storefront, used for the "view product" button. */
    storefrontUrl: z.string().url().optional(),
    /**
     * URL templates. Placeholders in `{braces}` are URL-encoded:
     * `{storefrontUrl}`, `{token}`, `{handle}`, `{variant_id}`, `{product_id}`,
     * `{country_code}`, `{locale}`.
     */
    urls: z
      .object({
        product: z.string().default("{storefrontUrl}/{country_code}/products/{handle}"),
        /** A storefront page that confirms with `POST /store/back-in-stock/confirm`. */
        confirm: z.string().optional(),
        /** A storefront page that unsubscribes with `POST /store/back-in-stock/unsubscribe`. */
        unsubscribe: z.string().optional(),
      })
      .default({ product: "{storefrontUrl}/{country_code}/products/{handle}" }),

    /** Sender for emails sent without the emails plugin. Leave unset to use the provider's own. */
    from: z.string().min(3).optional(),
    /** Notification channel used without the emails plugin. */
    channel: z.string().min(1).default("email"),
    /**
     * `auto` sends through `@bitshaft/medusa-plugin-emails` when it is installed
     * and has the `back-in-stock` template; `off` always uses the built-in template.
     */
    emails: z.enum(["auto", "off"]).default("auto"),
    /**
     * The shop's original language (BCP 47, e.g. `pl-PL`), used when a
     * subscriber's language is unknown. Use the same value as the emails
     * plugin's `defaultLocale`.
     */
    defaultLocale: localeTag.default("en"),

    /** Render and log emails, send nothing. */
    demo: z.boolean().default(false),
    store: z
      .object({
        /** Requests one visitor (IP address) may make per minute to the store routes. */
        rateLimitPerMinute: z.number().int().min(1).max(600).default(10),
      })
      .default({ rateLimitPerMinute: 10 }),

    /** Starting values of the settings editable in the admin. */
    settings: settingsSchema.default(settingsSchema.parse({})),
  })
  .superRefine((options, context) => {
    if (!options.backendUrl && !(options.urls.confirm && options.urls.unsubscribe)) {
      context.addIssue({
        code: "custom",
        path: ["backendUrl"],
        message:
          "is required for the unsubscribe and confirm links in emails (or set both urls.confirm and urls.unsubscribe)",
      })
    }
  })

export type BackInStockPluginOptionsInput = z.input<typeof pluginOptionsSchema>
export type BackInStockPluginOptions = z.output<typeof pluginOptionsSchema>

/**
 * Validates raw plugin options without throwing. Without a way to build
 * unsubscribe links the plugin stays disabled, because every email must
 * carry one; Medusa still starts.
 */
export function parseOptions(raw: unknown): PluginOptionsResult<BackInStockPluginOptions> {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const urls = (input.urls ?? {}) as Record<string, unknown>
  if (!input.backendUrl && !(urls.confirm && urls.unsubscribe)) {
    return {
      enabled: false,
      reason: "missing option backendUrl (needed for the unsubscribe link in every email)",
    }
  }
  return parsePluginOptions(pluginOptionsSchema, raw)
}

/** `pl_pl`, `PL-pl` → `pl-PL`. Undefined for anything that is not a language tag. */
export function canonicalLocale(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const tag = value.trim().replace(/_/g, "-")
  if (!tag || tag.length > 35) {
    return undefined
  }
  try {
    return Intl.getCanonicalLocales(tag)[0]
  } catch {
    return undefined
  }
}

/** `pl-PL` → `pl`. */
export function languageOf(locale: string): string {
  return locale.split(/[-_]/)[0].toLowerCase()
}

/**
 * The subscriber's language as a full code (`de-DE`), else the default. It
 * is stored and passed on to the emails plugin as it is, which matches it
 * to the store's languages.
 */
export function localeCode(value: unknown, fallback: string): string {
  return canonicalLocale(value) ?? fallback
}

/**
 * The language of this plugin's own texts for a code: its language when
 * there are texts in it, else the default's, else English.
 */
export function normalizeLocale(value: unknown, fallback: string): Locale {
  for (const candidate of [value, fallback]) {
    const code = canonicalLocale(candidate)
    const language = code ? languageOf(code) : undefined
    if (language && (LOCALES as readonly string[]).includes(language)) {
      return language as Locale
    }
  }
  return "en"
}

/**
 * Builds a URL from a template. Returns undefined when a placeholder has no
 * value, so callers can hide a button instead of linking nowhere.
 */
export function fillUrl(
  template: string | undefined,
  values: Record<string, string | number | null | undefined>
): string | undefined {
  if (!template) {
    return undefined
  }
  // Storefronts prefix paths with the language (`/en/…`); `{locale_code}` is the full code.
  const code = typeof values.locale === "string" && values.locale ? values.locale : undefined
  const all = code ? { ...values, locale: languageOf(code), locale_code: values.locale_code ?? code } : values
  let missing = false
  const url = template.replace(/\{([a-zA-Z_]+)\}/g, (_match, key: string) => {
    const value = all[key]
    if (value === undefined || value === null || value === "") {
      missing = true
      return ""
    }
    // Base URLs are inserted as they are; everything else is encoded.
    return key.endsWith("Url") ? String(value).replace(/\/+$/, "") : encodeURIComponent(String(value))
  })
  return missing ? undefined : url
}
