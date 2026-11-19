import { z } from "@medusajs/framework/zod"

import { settingsSchema } from "../settings"
import { STATUSES } from "../types"

const amount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const version = z.number().int().min(1)
const text = z.string().max(100_000)
const id = z.string().trim().min(1).max(200)

/* Store --------------------------------------------------------------------- */

export const StoreOpen = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("product"),
    variant_id: id.optional(),
    product_id: id.optional(),
    quantity: z.number().int().min(1),
    /** Per unit, in minor units. */
    target_unit_price: amount,
    region_id: id.optional(),
    currency_code: z.string().trim().length(3).optional(),
    message: text.nullish(),
  }),
  z.object({
    kind: z.literal("cart"),
    cart_id: id,
    /** For the whole cart, in minor units. */
    target_total: amount,
    message: text.nullish(),
  }),
])

export const StoreReply = z.object({
  version,
  message: text.nullish(),
  /** Per unit on a product thread, for the whole cart on a cart thread. */
  target_price: amount.nullish(),
})

export const StoreAccept = z.object({ version, price: amount })
export const StoreWithdraw = z.object({ version, message: text.nullish() })
export const StoreAddToCart = z.object({ cart_id: id })

const statusList = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  )
  .pipe(z.array(z.enum(STATUSES)))

const page = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}

export const StoreListQuery = z.object({ status: statusList, ...page })

/* Admin --------------------------------------------------------------------- */

export const AdminListQuery = z.object({
  status: statusList,
  waiting: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  q: z.string().max(200).optional(),
  customer_id: id.optional(),
  product_id: id.optional(),
  /** `me`, `none` (nobody leads the thread) or a user id. */
  assignee: z.union([z.enum(["me", "none"]), id]).optional(),
  ...page,
})

export const PriceInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("unit"), unit_price: amount }),
  z.object({ mode: z.literal("total"), total: amount }),
  z.object({ mode: z.literal("lines"), lines: z.array(z.object({ variant_id: id, unit_price: amount })).min(1) }),
])

export const AdminMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), version, message: text }),
  z.object({ type: z.literal("internal_note"), message: text }),
])

export const AdminCounter = z.object({
  version,
  price: PriceInputSchema,
  valid_until: z.coerce.date().nullish(),
  message: text.nullish(),
  confirm_below_floor: z.boolean().optional(),
})

export const AdminPreview = z.object({ price: PriceInputSchema })

export const AdminAccept = z.object({
  version,
  basis: z.enum(["target", "offer"]),
  price: amount,
  message: text.nullish(),
  confirm_below_floor: z.boolean().optional(),
})

export const AdminReject = z.object({ version, reason: text })
export const AdminAssign = z.object({ user_id: id.nullable() })

export const AdminDraftChoices = z.object({
  region_id: id.nullish(),
  sales_channel_id: id.nullish(),
  address_id: id.nullable().optional(),
})
export const AdminCommit = z.object({ dry_run_id: id })

export const AdminSettings = settingsSchema

export const AdminFloors = z.object({
  floors: z
    .array(z.object({ currency_code: z.string().trim().length(3), amount }))
    .max(50)
    .refine((list) => new Set(list.map((f) => f.currency_code.toLowerCase())).size === list.length, {
      message: "one minimum price per currency",
    }),
})

export const AdminRunsQuery = z.object({
  thread_id: id.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})
