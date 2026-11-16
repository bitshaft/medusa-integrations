import { z } from "@medusajs/framework/zod"

import { CONSENT_KEY_PATTERN } from "../consents"
import { CONSENT_PLACEMENTS, COOKIE_CATEGORIES, REQUEST_STATUSES, REQUEST_TYPES, WARNING_LANGUAGE } from "../types"

const text = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null))
const page = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}
/** Text per store language (ISO 639, e.g. `pl`, `de`). */
const perLanguage = (max: number) =>
  z
    .record(z.string().regex(WARNING_LANGUAGE), text(max))
    .refine((v) => Object.keys(v).length <= 40, "at most 40 languages")

/* Admin -------------------------------------------------------------------- */

const party = z
  .object({
    name: optionalText(300),
    trade_name: optionalText(300),
    postal_address: optionalText(1000),
    electronic_address: optionalText(300),
  })
  .partial()

export const AdminManufacturer = z.object({
  name: text(200).min(1),
  manufacturer: party.default({}),
  outside_eu: z.boolean().default(false),
  responsible: party.default({}),
})
export type AdminManufacturer = z.infer<typeof AdminManufacturer>

export const AdminProductSafety = z.object({
  manufacturer_id: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  manufacturer: party.default({}),
  outside_eu: z
    .boolean()
    .nullish()
    .transform((v) => v ?? null),
  responsible: party.default({}),
  identification: z
    .object({
      type: optionalText(300),
      model: optionalText(300),
      batch: optionalText(300),
      batch_applicable: z.boolean().default(false),
    })
    .default({ type: null, model: null, batch: null, batch_applicable: false }),
  label_image_url: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^(https?:\/\/|\/)/.test(v), "must be an http(s) URL or a path"),
  warnings: perLanguage(20_000).default({}),
})
export type AdminProductSafety = z.infer<typeof AdminProductSafety>

export const AdminGpsrQuery = z.object({
  complete: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(200).optional(),
  ...page,
})
export type AdminGpsrQuery = z.infer<typeof AdminGpsrQuery>

export const AdminConsentType = z.object({
  key: z.string().trim().regex(CONSENT_KEY_PATTERN, "lowercase letters, digits, dots, dashes or underscores"),
  name: perLanguage(200).default({}),
  placement: z.enum(CONSENT_PLACEMENTS),
  required: z.boolean().default(false),
  active: z.boolean().default(true),
  cookie_category: z
    .enum(COOKIE_CATEGORIES)
    .nullish()
    .transform((v) => v ?? null),
  text: perLanguage(20_000).default({}),
})
export type AdminConsentType = z.infer<typeof AdminConsentType>

export const AdminEntriesQuery = z.object({
  type_key: z.string().optional(),
  customer_id: z.string().optional(),
  email: z.string().optional(),
  ...page,
})
export type AdminEntriesQuery = z.infer<typeof AdminEntriesQuery>

export const AdminRequestsQuery = z.object({
  status: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.split(",").every((s) => (REQUEST_STATUSES as readonly string[]).includes(s)),
      "unknown status"
    ),
  type: z.enum(REQUEST_TYPES).optional(),
  ...page,
})
export type AdminRequestsQuery = z.infer<typeof AdminRequestsQuery>

export const AdminRequestAction = z.object({
  action: z.enum(["accept", "reject", "complete", "note", "anonymize"]),
  note: optionalText(2000),
})
export type AdminRequestAction = z.infer<typeof AdminRequestAction>

export const AdminExportQuery = z.object({ format: z.enum(["zip", "json"]).default("zip") })
export type AdminExportQuery = z.infer<typeof AdminExportQuery>

/* Store -------------------------------------------------------------------- */

const anonymousId = z
  .string()
  .trim()
  .min(8)
  .max(100)
  .regex(/^[\w-]+$/, "letters, digits, dashes or underscores")

export const StoreLocaleQuery = z.object({ locale: z.string().max(10).optional() })
export type StoreLocaleQuery = z.infer<typeof StoreLocaleQuery>

export const StoreOmnibusQuery = z.object({
  region_id: z.string().min(1).max(100).optional(),
  locale: z.string().max(10).optional(),
})
export type StoreOmnibusQuery = z.infer<typeof StoreOmnibusQuery>

export const StoreConsentTypesQuery = z.object({
  placement: z.enum(CONSENT_PLACEMENTS).optional(),
  locale: z.string().max(10).optional(),
})
export type StoreConsentTypesQuery = z.infer<typeof StoreConsentTypesQuery>

export const StoreConsentStateQuery = z.object({ anonymous_id: anonymousId.optional() })
export type StoreConsentStateQuery = z.infer<typeof StoreConsentStateQuery>

export const StoreConsents = z.object({
  anonymous_id: anonymousId.optional(),
  email: z.string().trim().email().max(320).optional(),
  placement: z.enum(CONSENT_PLACEMENTS).optional(),
  choices: z
    .array(
      z.object({
        type_key: z.string().trim().regex(CONSENT_KEY_PATTERN),
        granted: z.boolean(),
        version: z.number().int().positive().optional(),
      })
    )
    .min(1)
    .max(50),
  locale: z.string().max(10).optional(),
})
export type StoreConsents = z.infer<typeof StoreConsents>

export const StoreConsentLink = z.object({ anonymous_id: anonymousId })
export type StoreConsentLink = z.infer<typeof StoreConsentLink>

export const StoreRequest = z.object({
  type: z.enum(REQUEST_TYPES),
  email: z.string().trim().email().max(320).optional(),
  details: z.string().trim().max(2000).optional(),
  locale: z.string().max(10).optional(),
})
export type StoreRequest = z.infer<typeof StoreRequest>

export const StoreVerify = z.object({
  token: z.string().trim().min(20).max(200),
  locale: z.string().max(10).optional(),
})
export type StoreVerify = z.infer<typeof StoreVerify>
