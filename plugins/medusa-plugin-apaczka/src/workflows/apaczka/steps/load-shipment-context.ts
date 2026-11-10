import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import type { MedusaAddressLike, StockLocationLike } from "../../../lib/apaczka/addresses"
import { type ApaczkaFulfillmentData, readFulfillmentData } from "../../../lib/apaczka/data"
import { type ApaczkaFulfillmentOption, parseFulfillmentOption } from "../../../lib/apaczka/fulfillment-options"
import { codShareForShipment } from "../../../lib/apaczka/cod"
import { APACZKA_MODULE } from "../../../modules/apaczka"
import type ApaczkaModuleService from "../../../modules/apaczka/service"

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
  /** What cash on delivery for this shipment is based on. */
  cod: {
    order_total: number
    paid_total: number
    currency_code: string
    shipment_items_value: number
    order_items_value: number
    is_last_shipment: boolean
    /** COD already set on the order's other active shipments, PLN. */
    already_scheduled_pln: number
  }
}

/** Cash on delivery this shipment should collect, in PLN. */
export function codAmountForContext(context: ShipmentContext, exchangeRates: Record<string, number>): number {
  return codShareForShipment({
    orderTotal: context.cod.order_total,
    paidTotal: context.cod.paid_total,
    currencyCode: context.cod.currency_code,
    exchangeRates,
    shipmentItemsValue: context.cod.shipment_items_value,
    orderItemsValue: context.cod.order_items_value,
    isLastShipment: context.cod.is_last_shipment,
    alreadyScheduledPln: context.cod.already_scheduled_pln,
  })
}

const OPTION_KEY = "apaczka_option"

export const loadShipmentContextStepId = "apaczka-load-shipment-context"

/**
 * Gathers everything needed to create an Apaczka order for an existing
 * fulfillment: the service, the warehouse (with its full address), the
 * customer, the items and the order total.
 */
export async function loadShipmentContext(container: MedusaContainer, fulfillmentId: string): Promise<ShipmentContext> {
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

  const fromOption = parseFulfillmentOption(
    (fulfillment as { shipping_option?: { data?: unknown } }).shipping_option?.data
  )
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
              "currency_code",
              "summary.*",
              "shipping_address.*",
              "items.id",
              "items.title",
              "items.unit_price",
              "items.quantity",
              "items.requires_shipping",
              "items.detail.fulfilled_quantity",
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

  // Cash on delivery inputs: what is still owed, and what other shipments
  // of this order already collect.
  const shippable = [...orderItems.values()].filter((item) => item.requires_shipping !== false)
  const orderItemsValue = shippable.reduce(
    (sum, item) => sum + Number(item.unit_price ?? 0) * Number(item.quantity ?? 0),
    0
  )
  const isLastShipment = shippable.every(
    (item) =>
      Number((item.detail as { fulfilled_quantity?: number } | undefined)?.fulfilled_quantity ?? 0) >=
      Number(item.quantity ?? 0)
  )
  const summary = (order?.summary ?? {}) as { paid_total?: number | string; refunded_total?: number | string }
  const paidTotal = Number(summary.paid_total ?? 0) - Number(summary.refunded_total ?? 0)

  let alreadyScheduledPln = 0
  if (orderId && !option.is_return) {
    const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
    const others = await apaczka.listApaczkaShipments(
      { order_id: orderId, is_return: false },
      { select: ["fulfillment_id", "status", "cod_amount"] }
    )
    alreadyScheduledPln =
      others
        .filter((s) => s.fulfillment_id !== fulfillment.id && s.status !== "canceled")
        .reduce((sum, s) => sum + Number(s.cod_amount ?? 0), 0) / 100
  }

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
    cod: {
      order_total: Number(order?.total ?? 0),
      paid_total: Number.isFinite(paidTotal) ? Math.max(0, paidTotal) : 0,
      currency_code: String(order?.currency_code ?? "pln"),
      shipment_items_value: items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
      order_items_value: orderItemsValue,
      is_last_shipment: isLastShipment,
      already_scheduled_pln: alreadyScheduledPln,
    },
  }

  return context
}

export const loadShipmentContextStep = createStep(
  loadShipmentContextStepId,
  async (input: { fulfillment_id: string }, { container }) =>
    new StepResponse(await loadShipmentContext(container, input.fulfillment_id))
)
