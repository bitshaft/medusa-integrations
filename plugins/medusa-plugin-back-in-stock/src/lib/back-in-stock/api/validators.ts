import { z } from "@medusajs/framework/zod"

import { NOTIFICATION_STATUSES } from "../../../modules/back-in-stock/models/notification"
import { SUBSCRIPTION_STATUSES } from "../../../modules/back-in-stock/models/subscription"

const id = z.string().trim().min(1).max(100)
const token = z.string().trim().min(1).max(100)
const paging = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}
const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true")

export const StoreSubscribe = z.object({
  /** Required for guests. Ignored for logged-in customers: their account email is used. */
  email: z.string().trim().email().max(254).optional(),
  variant_id: id,
  /** Required when the publishable key is linked to several sales channels. */
  sales_channel_id: id.optional(),
  locale: z.string().trim().min(2).max(20).optional(),
  /** Used for the product link in emails (`{country_code}` in `urls.product`). */
  country_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
  /** The customer saw and accepted the consent text. */
  consent: z.literal(true, { message: "Accept the consent text to subscribe" }),
})

export const StoreToken = z.object({ token })

export const StoreConsentQuery = z.object({ locale: z.string().trim().min(2).max(20).optional() })

export const AdminSubscriptionsQuery = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  variant_id: id.optional(),
  product_id: id.optional(),
  sales_channel_id: id.optional(),
  /** Search by email. */
  q: z.string().trim().min(1).max(200).optional(),
  demo: booleanQuery.optional(),
  ...paging,
})

export const AdminNotificationsQuery = z.object({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  subscription_id: id.optional(),
  variant_id: id.optional(),
  ...paging,
})

export const AdminWantedQuery = z.object({
  demo: booleanQuery.optional(),
  ...paging,
})

export const AdminEndSubscription = z.object({
  status: z.enum(["unsubscribed", "expired"]).default("unsubscribed"),
})

export const AdminSeedDemo = z.object({
  emails: z.array(z.string().trim().email()).min(1).max(5),
  count: z.number().int().min(1).max(20).default(3),
  sales_channel_id: id.optional(),
  locale: z.enum(["en", "pl"]).optional(),
})

export const AdminSimulateRestock = z.object({
  variant_id: id,
  sales_channel_id: id,
})

export const AdminDeleteDemo = z.object({
  /** Must be the word DELETE. */
  confirm: z.literal("DELETE"),
})

export type StoreSubscribeBody = z.output<typeof StoreSubscribe>
export type StoreTokenBody = z.output<typeof StoreToken>
export type AdminSubscriptionsQueryParams = z.output<typeof AdminSubscriptionsQuery>
export type AdminNotificationsQueryParams = z.output<typeof AdminNotificationsQuery>
export type AdminWantedQueryParams = z.output<typeof AdminWantedQuery>
export type AdminEndSubscriptionBody = z.output<typeof AdminEndSubscription>
export type AdminSeedDemoBody = z.output<typeof AdminSeedDemo>
export type AdminSimulateRestockBody = z.output<typeof AdminSimulateRestock>
