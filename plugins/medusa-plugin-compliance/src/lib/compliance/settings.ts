import { z } from "@medusajs/framework/zod"

import { OMNIBUS_RULES, WARNING_LANGUAGE } from "./types"

/** Placeholder shown wherever a lawyer has to supply the wording. */
export const LAWYER_PLACEHOLDER = "[DO UZUPEŁNIENIA PRZEZ PRAWNIKA]"

/**
 * Links end up in an `href` (storefront) or an e-mail, so only web links
 * or paths on the storefront are accepted, never `javascript:` or `data:`.
 * Empty means "not set".
 */
export const isSafeLink = (value: string) =>
  value === "" || /^https?:\/\/[^\s/]/i.test(value) || /^\/(?!\/)/.test(value)

const link = () =>
  z
    .string()
    .trim()
    .max(500)
    .refine(isSafeLink, "must start with http://, https:// or / (a path on the storefront)")
    .default("")

const int = (min: number, max: number, value: number) => z.number().int().min(min).max(max).default(value)

export const omnibusExceptionSchema = z.object({
  target: z.enum(["product", "category"]),
  id: z.string().trim().min(1).max(100),
  /** Shown in the admin so the team remembers what the id is. */
  label: z.string().trim().max(200).default(""),
  rule: z.enum(OMNIBUS_RULES),
  /** Why the exception applies; for the team and for audits. */
  note: z.string().trim().max(1000).default(""),
})
export type OmnibusException = z.output<typeof omnibusExceptionSchema>

/**
 * Every setting the store owner edits in the admin, with the values a new
 * store starts with. Periods, scopes and exceptions are settings, never
 * hard-coded readings of the law; the Guide explains each one.
 * `prefault` (not `default`) so zod 4 fills the inner defaults of a missing object.
 */
export const settingsSchema = z
  .object({
    modules: z
      .object({
        gpsr: z.boolean().default(true),
        gdpr: z.boolean().default(true),
        omnibus: z.boolean().default(true),
      })
      .prefault({}),
    gpsr: z
      .object({
        /** Fields that must be filled for a product to count as complete. */
        require: z
          .object({
            manufacturer_trade_name: z.boolean().default(false),
            identification_type: z.boolean().default(true),
            identification_model: z.boolean().default(false),
            label_image: z.boolean().default(false),
            warnings: z.boolean().default(false),
          })
          .prefault({}),
        /** Languages the warnings must be written in when warnings are required. */
        warning_languages: z
          .array(z.string().trim().toLowerCase().regex(WARNING_LANGUAGE, "a language code such as pl or de"))
          .min(1)
          .default(["pl"]),
      })
      .prefault({}),
    gdpr: z
      .object({
        /** Days the store has to answer a verified request. */
        response_days: int(1, 365, 30),
        /** Warn this many days before the deadline. */
        warn_days: int(0, 60, 7),
        /** How long the confirmation link works. */
        token_hours: int(1, 24 * 14, 48),
        /**
         * Storefront page that confirms a request; `{token}` is replaced. It
         * goes into the verification event for the e-mail plugin.
         */
        verify_url: link(),
        privacy_policy_url: link(),
        /** Shown to the customer after submitting a request. */
        request_notice: z.string().trim().max(2000).default(LAWYER_PLACEHOLDER),
        rate_limit: z
          .object({
            per_email: int(1, 100, 3),
            per_ip: int(1, 1000, 10),
            window_minutes: int(1, 24 * 60, 60),
          })
          .prefault({}),
        anonymize: z
          .object({
            /** Replaces names and other text fields. */
            placeholder: z.string().trim().min(1).max(60).default("[anonimizacja]"),
            customer_metadata: z.boolean().default(true),
            order_email: z.boolean().default(true),
            order_phone: z.boolean().default(true),
            order_shipping_address: z.boolean().default(true),
            /** Billing addresses stay for invoices until the retention period ends. */
            order_billing_address: z.boolean().default(false),
            /** Months after the order date that billing data is kept, then removed by a daily job. 0 = never removed automatically. */
            billing_retention_months: int(0, 240, 72),
            carts: z.boolean().default(true),
          })
          .prefault({}),
      })
      .prefault({}),
    omnibus: z
      .object({
        /** Days before a discount in which the lowest price is looked for. */
        period_days: int(1, 365, 30),
        /** Count automatic promotions without conditions as discounts on the product page. */
        automatic_promotions: z.boolean().default(true),
        /** Count promotion codes too (each code alone, without cart conditions). Off: codes are skipped. */
        code_promotions: z.boolean().default(false),
        /** Region id → country used for tax when a region has several countries. */
        tax_country: z.record(z.string(), z.string().length(2)).default({}),
        exceptions: z.array(omnibusExceptionSchema).max(500).default([]),
      })
      .prefault({}),
  })
  .prefault({})

export type ComplianceSettings = z.output<typeof settingsSchema>
export type SettingsInput = z.input<typeof settingsSchema>

export const DEFAULT_SETTINGS: ComplianceSettings = settingsSchema.parse({})

export function readSettings(stored: unknown): ComplianceSettings {
  const parsed = settingsSchema.safeParse(withoutUnsafeLinks(stored))
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

/**
 * Links stored before they had to be web links are cleared on their own,
 * so they do not send every other setting back to the defaults.
 */
function withoutUnsafeLinks(stored: unknown): unknown {
  if (!stored || typeof stored !== "object") return stored ?? {}
  const gdpr = (stored as { gdpr?: unknown }).gdpr
  if (!gdpr || typeof gdpr !== "object") return stored
  const cleaned: Record<string, unknown> = { ...(gdpr as Record<string, unknown>) }
  for (const key of ["verify_url", "privacy_policy_url"]) {
    const value = cleaned[key]
    if (typeof value === "string" && !isSafeLink(value.trim())) cleaned[key] = ""
  }
  return { ...stored, gdpr: cleaned }
}

export type ModuleKey = keyof ComplianceSettings["modules"]
