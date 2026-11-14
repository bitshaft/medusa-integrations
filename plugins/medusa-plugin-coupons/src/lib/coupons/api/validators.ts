import { z } from "@medusajs/framework/zod"

import { COUPON_FILTERS } from "../status"
import { AUDIENCES, COUPON_KINDS } from "../types"

const ids = z.array(z.string().min(1)).max(1000).default([])
const money = z.number().finite().min(0).max(100_000_000)
const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "must be an ISO date")
  .nullable()
  .default(null)

/** A coupon as the wizard sends it (`CouponDraft`). Business rules are checked by `validateDraft`. */
export const DraftSchema = z.object({
  kind: z.enum(COUPON_KINDS),
  value: money.nullable().default(null),
  currency_code: z
    .string()
    .regex(/^[a-zA-Z]{3}$/)
    .nullable()
    .default(null),
  category_ids: ids,
  buy_qty: z.number().int().min(1).max(1000).nullable().default(null),
  get_qty: z.number().int().min(1).max(1000).nullable().default(null),
  buy_product_ids: ids,
  tiers: z
    .array(z.object({ min: money, value: money }))
    .max(10)
    .nullable()
    .default(null),
  code: z.string().max(40).nullable().default(null),
  automatic: z.boolean().default(false),
  starts_at: isoDate,
  ends_at: isoDate,
  usage_limit: z.number().int().min(1).max(100_000_000).nullable().default(null),
  per_customer_limit: z.number().int().min(1).max(1000).nullable().default(null),
  audience: z.enum(AUDIENCES).default("all"),
  audience_ids: ids,
  first_order_only: z.boolean().default(false),
  exclusive: z.boolean().default(false),
  min_subtotal: money.nullable().default(null),
  exclusions: z
    .object({ product_ids: ids, collection_ids: ids, category_ids: ids, skip_discounted: z.boolean().default(false) })
    .prefault({}),
})

export const AdminCreateCoupon = z.object({ draft: DraftSchema, name: z.string().max(120).nullable().optional() })
export type AdminCreateCoupon = z.infer<typeof AdminCreateCoupon>

export const AdminPreviewCoupon = z.object({ draft: DraftSchema, id: z.string().optional() })
export type AdminPreviewCoupon = z.infer<typeof AdminPreviewCoupon>

export const AdminCreateBatch = z.object({
  draft: DraftSchema,
  prefix: z.string().max(12).default(""),
  quantity: z.number().int().min(1),
  name: z.string().max(120).nullable().optional(),
})
export type AdminCreateBatch = z.infer<typeof AdminCreateBatch>

export const AdminCouponStatus = z.object({ status: z.enum(["active", "paused"]) })
export type AdminCouponStatus = z.infer<typeof AdminCouponStatus>

export const AdminCouponsQuery = z.object({
  filter: z.enum(COUPON_FILTERS).optional(),
  q: z.string().max(100).optional(),
})

export const AdminExportQuery = z.object({ locale: z.enum(["pl", "en"]).optional() })

export const AdminSettings = z.object({
  currencyCode: z
    .string()
    .regex(/^[a-zA-Z]{3}$/)
    .optional(),
  codeLength: z.number().int().min(6).max(20).optional(),
  exportLocale: z.enum(["pl", "en"]).optional(),
})
export type AdminSettings = z.infer<typeof AdminSettings>

export const StoreCheckCoupon = z.object({
  cart_id: z.string().min(1),
  code: z.string().trim().min(1).max(40),
  locale: z.enum(["pl", "en"]).optional(),
})
export type StoreCheckCoupon = z.infer<typeof StoreCheckCoupon>

export const StoreProgressQuery = z.object({ cart_id: z.string().min(1), locale: z.enum(["pl", "en"]).optional() })
