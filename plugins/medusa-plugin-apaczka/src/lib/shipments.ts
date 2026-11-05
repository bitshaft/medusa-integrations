import type { ApaczkaClient, ApaczkaLogger, ApaczkaOrderInput, ApaczkaOrderSummary } from "./apaczka"
import { ShipmentStatus, fromPollingStatus } from "./apaczka"
import type { ApaczkaFulfillmentState } from "./data"
import { decimalStringToGrosze } from "./money"
import { buildOrderPayload, type BuildOrderInput } from "./order-builder"
import { optionsForService } from "./options"
import { resolvePickup } from "./pickup"

/** Admin route that streams a document; used as the Medusa label URL. */
export function documentUrl(apaczkaOrderId: number | string, type: "waybill" | "dispatch_code" = "waybill"): string {
  return `/admin/apaczka/orders/${apaczkaOrderId}/documents/${type}`
}

export type FulfillmentLabel = { tracking_number: string; tracking_url: string; label_url: string }

export type CreatedShipment = {
  state: ApaczkaFulfillmentState
  labels: FulfillmentLabel[]
  order: ApaczkaOrderSummary
  payload: ApaczkaOrderInput
}

/**
 * Creates the Apaczka order for a fulfillment and describes the result in the
 * shape stored on `fulfillment.data` and `fulfillment.labels`.
 *
 * `order_send` is not idempotent, so it is called exactly once. Reading the
 * final price afterwards is best-effort: if it fails the shipment still
 * exists and the price can be synced later.
 */
export async function createShipment(input: {
  client: ApaczkaClient
  build: Omit<BuildOrderInput, "purpose" | "pickup">
  logger?: ApaczkaLogger
}): Promise<CreatedShipment> {
  const { client, build, logger } = input
  const serviceId = build.overrides?.service_id ?? build.option.service_id

  const sender = build.option.is_return ? build.customer : build.warehouse
  const pickup =
    build.overrides?.pickup ??
    (await resolvePickup({
      client,
      option: build.option,
      serviceId,
      senderPostalCode: sender.postal_code,
      pickup: optionsForService(build.options, serviceId).pickup,
      logger,
    }))

  const payload = await buildOrderPayload({ ...build, purpose: "shipment", pickup })
  const order = await client.sendOrder(payload)

  let priceNet: number | undefined
  let priceGross: number | undefined
  try {
    const details = await client.getOrder(order.id)
    priceNet = decimalStringToGrosze(details.price) ?? undefined
    priceGross = decimalStringToGrosze(details.price_gross) ?? undefined
  } catch (error) {
    logger?.warn(`[apaczka] Order ${order.id} created, but reading its price failed: ${(error as Error).message}`)
  }

  const state: ApaczkaFulfillmentState = {
    state: "created",
    status: order.status ? fromPollingStatus(order.status) : ShipmentStatus.CREATED,
    order_id: order.id,
    waybill_number: order.waybill_number,
    tracking_url: order.tracking_url,
    service_id: order.service_id ?? serviceId,
    service_name: order.service_name ?? build.option.service_name,
    supplier: order.supplier ?? build.option.supplier,
    is_return: build.option.is_return,
    cod: Boolean(payload.cod),
    point_id: payload.address.receiver.foreign_address_id,
    label_format: build.options.labelFormat,
    price_net: priceNet,
    price_gross: priceGross,
    cod_amount: payload.cod?.amount,
    declared_value: payload.shipment_value,
    created_at: new Date().toISOString(),
    sender_postal_code: payload.address.sender.postal_code,
  }

  return { state, labels: labelsFor(state), order, payload }
}

export function labelsFor(state: ApaczkaFulfillmentState): FulfillmentLabel[] {
  if (!state.order_id) {
    return []
  }
  return [
    {
      tracking_number: state.waybill_number ?? String(state.order_id),
      tracking_url: state.tracking_url ?? "",
      label_url: documentUrl(state.order_id),
    },
  ]
}
