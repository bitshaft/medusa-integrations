import { z } from "@medusajs/framework/zod"

import { currencyRuleSchema } from "../settings"

const id = z.string().trim().min(1).max(100)

/** Arrays past 20 items arrive from qs as objects keyed by index. */
const ids = z.preprocess(
  (value) => (value && typeof value === "object" && !Array.isArray(value) ? Object.values(value) : value),
  z.array(id).min(1).max(5000)
)

export const FillScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("products"), ids }),
  z.object({ kind: z.literal("collection"), id }),
  z.object({ kind: z.literal("category"), id }),
  z.object({ kind: z.literal("demo") }),
])

export const AdminFillPreview = z.object({
  scope: FillScopeSchema,
  currencies: z
    .array(z.string().regex(/^[a-zA-Z]{3}$/))
    .max(200)
    .optional(),
  overwrite: z.boolean().default(false),
  price_lists: z.boolean().default(false),
  region_prices: z.boolean().default(true),
  allow_stale: z.boolean().default(false),
})
export type AdminFillPreviewType = z.output<typeof AdminFillPreview>

export const AdminFillApply = AdminFillPreview.extend({
  /** The preview's fingerprint: the save goes ahead only if nothing changed since. */
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  /** Required when the preview overwrites prices: the admin confirmed it. */
  confirm_overwrite: z.boolean().default(false),
})
export type AdminFillApplyType = z.output<typeof AdminFillApply>

export const AdminSample = z.object({
  currency: z.string().regex(/^[a-zA-Z]{3}$/),
  rule: currencyRuleSchema,
  amount: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,4})?$/)
    .default("100"),
  base_currency: z
    .string()
    .regex(/^[a-zA-Z]{3}$/)
    .nullable()
    .optional(),
  base_tax_country: z
    .string()
    .regex(/^[a-zA-Z]{2}$/)
    .nullable()
    .optional(),
})
export type AdminSampleType = z.output<typeof AdminSample>

export const AdminRatesQuery = z.object({ refresh: z.enum(["true", "false"]).optional() })

export const AdminRunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  product_id: id.optional(),
})

export const AdminSuggest = z.object({
  /** One typed price per row of Medusa's price editor; every other column of the row is computed from it. */
  rows: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        slot: z.string().trim().min(1).max(100),
        amount: z.string().regex(/^\d{1,12}(\.\d{1,10})?$/),
      })
    )
    .min(1)
    .max(1000),
})
export type AdminSuggestType = z.output<typeof AdminSuggest>
