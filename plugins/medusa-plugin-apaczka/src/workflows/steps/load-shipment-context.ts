import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import type { MedusaAddressLike, StockLocationLike } from "../../lib/addresses"
import { type ApaczkaFulfillmentData, readFulfillmentData } from "../../lib/data"
import { type ApaczkaFulfillmentOption, parseFulfillmentOption } from "../../lib/fulfillment-options"

export type ShipmentContextItem = {
  line_item_id: string | null
  title: string
  quantity: number
  unit_price: number
  variant?: { weight?: number | null; length?: number | null; width?: number | null; height?: number | null } | null
}

export type ShipmentContext = {
  fulfillment_id: string
  provider_id: string | null
  location_id: string | null
  data: ApaczkaFulfillmentData
  option: ApaczkaFulfillmentOption
  location: StockLocationLike | null
  /** Where the parcel goes (customer on outbound, warehouse on returns). */
  delivery_address: MedusaAddressLike | null
  /** The customer's address (same as delivery_address on outbound). */
  customer_address: MedusaAddressLike | null
  email: string | null
  order_id: string | null
  display_id: number | null
  order_total: number
  return_id: string | null
  items: ShipmentContextItem[]
  canceled: boolean
  shipped: boolean
}

const OPTION_KEY = "apaczka_option"

export const loadShipmentContextStepId = "apaczka-load-shipment-context"

/**
 * Gathers everything needed to create an Apaczka order for an existing
 * fulfillment: the service, the warehouse (with its full address), the
 * customer, the items and the order total.
 */
export async function loadShipmentContext(
  container: MedusaContainer,
  fulfillmentId: string
): Promise<ShipmentContext> {
  const input = { fulfillment_id: fulfillmentId }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [fulfillment],
  } = await query.graph({
    entity: "fulfillment",
    filters: { id: input.fulfillment_id },
    fields: [
      "id",
      "provider_id",
      "location_id",
      "data",
      "canceled_at",
      "shipped_at",
      "delivery_address.*",
      "items.line_item_id",
      "items.title",
      "items.quantity",
      "shipping_option.data",
      "order.id",
      "return.id",
      "return.order_id",
    ],
  })

  if (!fulfillment) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Fulfillment ${input.fulfillment_id} was not found`)
  }

  const data = readFulfillmentData(fulfillment.data)
  const returnRecord = (fulfillment as { return?: { id: string; order_id: string } | null }).return ?? null
  const orderId = (fulfillment as { order?: { id: string } | null }).order?.id ?? returnRecord?.order_id ?? null

  const fromOption = parseFulfillmentOption((fulfillment as { shipping_option?: { data?: unknown } }).shipping_option?.data)
  const fromData = parseFulfillmentOption((data as Record<string, unknown>)[OPTION_KEY])
  const baseOption = fromData ?? fromOption
  if (!baseOption) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Fulfillment ${input.fulfillment_id} does not use an Apaczka shipping option`
    )
  }
  const option = { ...baseOption, is_return: baseOption.is_return || Boolean(returnRecord) }

  const [location, order] = await Promise.all([
    fulfillment.location_id
      ? query
          .graph({
            entity: "stock_location",
            filters: { id: fulfillment.location_id },
            fields: ["id", "name", "address.*"],
          })
          .then(({ data }) => (data[0] as StockLocationLike | undefined) ?? null)
      : Promise.resolve(null),
    orderId
      ? query
          .graph({
            entity: "order",
            filters: { id: orderId },
            fields: [
              "id",
              "display_id",
              "email",
              "total",
              "shipping_address.*",
              "items.id",
              "items.title",
              "items.unit_price",
              "items.variant.weight",
              "items.variant.length",
              "items.variant.width",
              "items.variant.height",
            ],
          })
          .then(({ data }) => data[0] ?? null)
      : Promise.resolve(null),
  ])

  const orderItems = new Map(
    ((order?.items ?? []) as Array<Record<string, unknown> | null>)
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => [item.id as string, item])
  )

  const items: ShipmentContextItem[] = ((fulfillment.items ?? []) as Array<Record<string, unknown>>).map((item) => {
    const orderItem = orderItems.get(item.line_item_id as string)
    return {
      line_item_id: (item.line_item_id as string) ?? null,
      title: String(item.title ?? orderItem?.title ?? ""),
      quantity: Number(item.quantity ?? 1),
      unit_price: Number(orderItem?.unit_price ?? 0),
      variant: (orderItem?.variant as ShipmentContextItem["variant"]) ?? null,
    }
  })

  const shippingAddress = (order?.shipping_address as MedusaAddressLike | null | undefined) ?? null
  const deliveryAddress = (fulfillment.delivery_address as MedusaAddressLike | null) ?? null

  const context: ShipmentContext = {
    fulfillment_id: fulfillment.id,
    provider_id: fulfillment.provider_id ?? null,
    location_id: fulfillment.location_id ?? null,
    data,
    option,
    location,
    delivery_address: deliveryAddress,
    customer_address: option.is_return ? shippingAddress : (deliveryAddress ?? shippingAddress),
    email: (order?.email as string | null | undefined) ?? null,
    order_id: orderId,
    display_id: (order?.display_id as number | null | undefined) ?? null,
    order_total: Number(order?.total ?? 0),
    return_id: returnRecord?.id ?? null,
    items,
    canceled: Boolean(fulfillment.canceled_at),
    shipped: Boolean(fulfillment.shipped_at),
  }

  return context
}

export const loadShipmentContextStep = createStep(
  loadShipmentContextStepId,
  async (input: { fulfillment_id: string }, { container }) =>
    new StepResponse(await loadShipmentContext(container, input.fulfillment_id))
)
