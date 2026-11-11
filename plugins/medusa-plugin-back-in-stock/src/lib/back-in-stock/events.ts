/**
 * Events emitted by the plugin. Subscribe to them from your own code:
 *
 * ```ts
 * export const config: SubscriberConfig = { event: BackInStockEvents.NOTIFIED }
 * ```
 */
export const BackInStockEvents = {
  /** A customer subscribed (`BackInStockSubscriptionEventData`). */
  SUBSCRIBED: "back-in-stock.subscription.subscribed",
  /** A variant went from out of stock to in stock in a sales channel (`BackInStockRestockedEventData`). */
  RESTOCKED: "back-in-stock.variant.restocked",
  /** A back-in-stock email was sent, or rendered in demo mode (`BackInStockNotifiedEventData`). */
  NOTIFIED: "back-in-stock.subscription.notified",
  /** Internal timer: a pending stock check is due. Not meant for other subscribers. */
  CHECK_DUE: "back-in-stock.check.due",
} as const

export type BackInStockSubscriptionEventData = {
  id: string
  variant_id: string
  sales_channel_id: string
  customer_id: string | null
  status: string
}

export type BackInStockRestockedEventData = {
  variant_id: string
  sales_channel_id: string
  /** Units available; `null` for variants that are not stock-managed. */
  available: number | null
  /** Active subscriptions that may be notified. */
  waiting: number
}

export type BackInStockNotifiedEventData = {
  id: string
  subscription_id: string
  variant_id: string
  sales_channel_id: string
  customer_id: string | null
  notification_count: number
  demo: boolean
}
