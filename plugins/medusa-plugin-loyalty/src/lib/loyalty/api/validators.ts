import { z } from "@medusajs/framework/zod"

import { ENTRY_TYPES, REWARD_KINDS } from "../types"

const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().default(null)

/** A reward as the admin form sends it. Rules that depend on the kind are checked here too. */
export const AdminReward = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().default(null),
    kind: z.enum(REWARD_KINDS),
    value: z.number().finite().min(0).max(1_000_000).nullable().default(null),
    currency_code: z
      .string()
      .regex(/^[a-zA-Z]{3}$/)
      .transform((v) => v.toLowerCase())
      .nullable()
      .default(null),
    variant_id: z.string().min(1).nullable().default(null),
    cost: z.number().int().min(1).max(100_000_000),
    active: z.boolean().default(true),
    min_tier_id: z.string().min(1).nullable().default(null),
    per_customer_limit: optionalInt(1, 10_000),
    code_valid_days: optionalInt(1, 3650),
  })
  .superRefine((reward, ctx) => {
    if (reward.kind === "fixed" && !(reward.value && reward.value > 0)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "an amount reward needs an amount above 0" })
    }
    if (reward.kind === "percentage" && !(reward.value && reward.value > 0 && reward.value <= 100)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "a percentage must be above 0 and at most 100" })
    }
    if (reward.kind === "gift" && !reward.variant_id) {
      ctx.addIssue({ code: "custom", path: ["variant_id"], message: "a gift needs a product variant" })
    }
  })
export type AdminReward = z.infer<typeof AdminReward>

export const AdminEntriesQuery = z.object({
  type: z.enum(ENTRY_TYPES).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  format: z.enum(["json", "csv"]).default("json"),
  locale: z.enum(["pl", "en"]).optional(),
})

export const AdminCustomersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const AdminAdjust = z.object({
  points: z
    .number()
    .int()
    .refine((n) => n !== 0, "points cannot be 0")
    .refine((n) => Math.abs(n) <= 10_000_000, "too many points"),
  reason: z.string().trim().min(3).max(500),
  /** The form's own id, so a double submit writes once. */
  request_id: z.string().min(8).max(64),
})
export type AdminAdjust = z.infer<typeof AdminAdjust>

export const AdminPreview = z.object({
  amount: z.number().min(0).max(100_000_000).default(300),
  tier_id: z.string().nullable().default(null),
  balance: z.number().int().default(1200),
  locale: z.enum(["pl", "en"]).optional(),
})
export type AdminPreview = z.infer<typeof AdminPreview>

export const StoreHistoryQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const StoreRedeem = z.object({ cart_id: z.string().min(1).nullable().optional() })
export type StoreRedeem = z.infer<typeof StoreRedeem>

export const StoreEstimateQuery = z
  .object({
    amount: z.coerce.number().min(0).max(100_000_000).optional(),
    cart_id: z.string().min(1).optional(),
    locale: z.enum(["pl", "en"]).optional(),
  })
  .refine((q) => q.amount != null || q.cart_id, "send amount or cart_id")

export const StoreBirthday = z.object({
  birthday: z.string().trim().min(5).max(10),
  locale: z.enum(["pl", "en"]).optional(),
})
export type StoreBirthday = z.infer<typeof StoreBirthday>
