/**
 * Events emitted by the plugin. Subscribe to them to send your own
 * notifications or sync other systems:
 *
 * ```ts
 * export const config: SubscriberConfig = { event: ApaczkaEvents.DELIVERED }
 * ```
 *
 * Every payload includes `id` (the `apaczka_shipment` ID), `fulfillment_id`,
 * `order_id` and `status`.
 */
export const ApaczkaEvents = {
  SHIPMENT_CREATED: "apaczka.shipment.created",
  STATUS_CHANGED: "apaczka.shipment.status_changed",
  SHIPPED: "apaczka.shipment.shipped",
  READY_FOR_PICKUP: "apaczka.shipment.ready_for_pickup",
  DELIVERED: "apaczka.shipment.delivered",
  EXCEPTION: "apaczka.shipment.exception",
  RETURNED: "apaczka.shipment.returned",
  CANCELED: "apaczka.shipment.canceled",
  PICKUP_BOOKED: "apaczka.pickup.booked",
} as const

export type ApaczkaEventName = (typeof ApaczkaEvents)[keyof typeof ApaczkaEvents]

export type ApaczkaShipmentEventData = {
  id: string
  fulfillment_id: string
  order_id: string | null
  status: string
  previous_status?: string
  waybill_number?: string | null
  tracking_url?: string | null
  is_return?: boolean
}
