import { z } from "@medusajs/framework/zod"

import { MESSAGE_STATUSES } from "../../../modules/emails/models/message"
import {
  ALIGNMENTS,
  BUTTON_SHAPES,
  type ButtonShape,
  CARD_SHAPES,
  type CardShape,
  COLOR_KEYS,
  FONTS,
  type FontKey,
  HEX_COLOR,
} from "../theme"

/** One of the store's languages (`pl-PL`); checked in the route, which knows them. */
const locale = z.string().trim().min(1).max(35)
const email = z.string().trim().email().max(254)
const recipients = z.array(email).max(50)
/** `{ "pl-PL": { subject: "…" }, "en-US": { … } }`; checked against the type's fields and languages in the route. */
const copy = z.record(z.string(), z.record(z.string(), z.string()))

export const AdminUpdateSettings = z.object({
  /** `null` goes back to the recipients from the plugin options. */
  team_recipients: recipients.nullable().optional(),
  /** `null` goes back to the threshold from the plugin options. */
  low_stock_threshold: z.number().int().min(0).max(1_000_000).nullable().optional(),
})

export const AdminUpdateType = z.object({
  enabled: z.boolean().optional(),
  /** Team emails only. `null` or an empty list uses the general recipients. */
  recipients: recipients.nullable().optional(),
  copy: copy.optional(),
})

export const AdminResetType = z.object({
  /** Must repeat the type from the URL, so a reset is never an accident. */
  confirm: z.string().min(1),
  /** `copy` restores the default text; `all` also restores the toggle and recipients. */
  scope: z.enum(["copy", "all"]).default("copy"),
})

export const AdminResetAll = z.object({
  /** Must be the word RESET. */
  confirm: z.literal("RESET"),
})

/** The Appearance tab; every field optional, missing means "as in the plugin options". */
export const ThemeBody = z.object({
  colors: z
    .partialRecord(z.enum(COLOR_KEYS), z.string().regex(HEX_COLOR, "Expected a hex color like #1f2937"))
    .optional(),
  font: z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]).optional(),
  button_shape: z.enum(Object.keys(BUTTON_SHAPES) as [ButtonShape, ...ButtonShape[]]).optional(),
  card_shape: z.enum(Object.keys(CARD_SHAPES) as [CardShape, ...CardShape[]]).optional(),
  header_align: z.enum(ALIGNMENTS).optional(),
  /** An https URL, or `null` to show the store name instead of a logo. */
  logo_url: z
    .string()
    .trim()
    .regex(/^https:\/\/\S+$/i, "Expected an https:// URL of a PNG or JPG")
    .nullable()
    .optional(),
  logo_width: z.number().int().min(40).max(600).optional(),
})

export const AdminUpdateTheme = z.object({
  /** `null` restores the look from the plugin options. */
  theme: ThemeBody.nullable(),
})

export const AdminPreviewType = z.object({
  locale: locale.optional(),
  order_id: z.string().min(1).optional(),
  /** Unsaved edits to preview. */
  copy: copy.optional(),
  /** An unsaved theme to preview. */
  theme: ThemeBody.optional(),
})

export const AdminTestType = z.object({
  to: email,
  locale: locale.optional(),
  order_id: z.string().min(1).optional(),
})

export const AdminMessagesQuery = z.object({
  order_id: z.string().min(1).optional(),
  customer_id: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  status: z.enum(MESSAGE_STATUSES).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export type AdminUpdateSettingsBody = z.output<typeof AdminUpdateSettings>
export type AdminUpdateTypeBody = z.output<typeof AdminUpdateType>
export type AdminResetTypeBody = z.output<typeof AdminResetType>
export type AdminUpdateThemeBody = z.output<typeof AdminUpdateTheme>
export type AdminPreviewTypeBody = z.output<typeof AdminPreviewType>
export type AdminTestTypeBody = z.output<typeof AdminTestType>
export type AdminMessagesQueryParams = z.output<typeof AdminMessagesQuery>
