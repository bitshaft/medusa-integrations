import type { NotificationStatus } from "../../modules/back-in-stock/models/notification"
import type { SubscriptionStatus } from "../../modules/back-in-stock/models/subscription"
import type { AvailabilityReason } from "./availability"

export type SubscriptionRecord = {
  id: string
  email: string | null
  variant_id: string
  product_id: string | null
  sales_channel_id: string
  customer_id: string | null
  locale: string
  country_code: string | null
  status: SubscriptionStatus
  consent_text: string | null
  confirmed_at: Date | null
  notification_count: number
  last_notified_at: Date | null
  ended_at: Date | null
  anonymized_at: Date | null
  demo: boolean
  created_at: Date
}

export type PendingCheckRecord = {
  id: string
  variant_id: string
  sales_channel_id: string
  due_at: Date
  claimed_at: Date | null
  dirty_at: Date | null
  forced: boolean
}

export type VariantStateRecord = {
  variant_id: string
  sales_channel_id: string
  in_stock: boolean
  available: number | null
  reason: AvailabilityReason | string | null
  checked_at: Date
  restocked_at: Date | null
}

export type NotificationRecord = {
  id: string
  subscription_id: string
  variant_id: string
  sales_channel_id: string
  kind: "restock" | "confirm"
  status: NotificationStatus
  via: string | null
  available: number | null
  error: string | null
  sent_at: Date | null
  created_at: Date
}

/** A variant in a sales channel: the unit of stock tracking. */
export type Pair = { variant_id: string; sales_channel_id: string }

export const pairKey = (pair: Pair) => `${pair.variant_id}|${pair.sales_channel_id}`
