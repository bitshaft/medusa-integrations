import { MedusaError } from "@medusajs/framework/utils"

import type { ApaczkaAddress, ApaczkaOrderInput, ApaczkaOrderPickup, ApaczkaParcel } from "./apaczka"
import type { ShipmentOverrides } from "./data"
import type { ApaczkaFulfillmentOption } from "./fulfillment-options"
import { toGrosze } from "./money"
import { type ApaczkaPluginOptions, optionsForService, type TransformOrderContext } from "./options"
import { buildParcels, type ParcelItem } from "./parcels"

export const WEBHOOK_PATH = "/hooks/apaczka/tracking"

export type BuildOrderInput = {
  options: ApaczkaPluginOptions
  option: ApaczkaFulfillmentOption
  purpose: TransformOrderContext["purpose"]
  /** Warehouse address (receiver on returns). */
  warehouse: ApaczkaAddress
  /** Customer address (sender on returns). */
  customer: ApaczkaAddress
  items: ParcelItem[]
  /** Value of the shipped items in major units (for insurance). */
  itemsValue?: number
  /** Amount to collect on delivery, major units. Only used for COD options. */
  codAmount?: number
  pickup?: ApaczkaOrderPickup
  overrides?: ShipmentOverrides
  /** Template values. */
  displayId?: string | number
  orderId?: string
  cartId?: string
}

/**
 * Builds the `order` payload for `order_valuation` / `order_send`.
 *
 * Pure function of its input: the same input always gives the same payload,
 * so a price quote and the final order cannot drift apart.
 */
export async function buildOrderPayload(input: BuildOrderInput): Promise<ApaczkaOrderInput> {
  const { options, option, overrides = {} } = input
  const serviceId = overrides.service_id ?? option.service_id
  const scoped = optionsForService(options, serviceId)
  const isReturn = option.is_return

  const sender: ApaczkaAddress = isReturn ? { ...input.customer } : { ...input.warehouse }
  const receiver: ApaczkaAddress = isReturn ? { ...input.warehouse } : { ...input.customer }

  if (overrides.point_id) {
    receiver.foreign_address_id = overrides.point_id
  }

  if (!isReturn && option.destination === "point" && !receiver.foreign_address_id && input.purpose === "shipment") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${option.name} delivers to a parcel point, but no point was chosen. ` +
        "Send `point_id` in the shipping method data at checkout, or set it when creating the shipment."
    )
  }

  const content = renderTemplate(overrides.content ?? options.contentTemplate, input)
  const comment = overrides.comment ?? (options.commentTemplate ? renderTemplate(options.commentTemplate, input) : undefined)

  const parcels: ApaczkaParcel[] = overrides.parcels?.length
    ? overrides.parcels.map((parcel) => ({
        shipment_type_code: parcel.package_type ?? scoped.parcel.packageType,
        dimension1: Math.max(1, Math.ceil(parcel.length)),
        dimension2: Math.max(1, Math.ceil(parcel.width)),
        dimension3: Math.max(1, Math.ceil(parcel.height)),
        weight: Math.ceil(parcel.weight * 100) / 100,
        is_nstd: parcel.non_standard ? 1 : 0,
      }))
    : (options.buildParcels ?? buildParcels)({
        items: input.items,
        options: scoped.parcel,
        serviceId,
        content,
      })

  if (!parcels.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "An Apaczka shipment needs at least one parcel")
  }

  const order: ApaczkaOrderInput = {
    service_id: serviceId,
    address: { sender, receiver },
    shipment: parcels,
    pickup: overrides.pickup ?? input.pickup ?? { type: "SELF" },
    content,
    ...(comment ? { comment } : {}),
  }

  // Cash on delivery
  const codAmount = overrides.cod_amount ?? (option.cod && !isReturn ? input.codAmount : undefined)
  if (codAmount && codAmount > 0) {
    if (!options.cod.bankAccount && !options.cod.bankAccountId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Cash on delivery needs a payout account: set `cod.bankAccount` (IBAN) or `cod.bankAccountId` in the plugin options."
      )
    }
    order.cod = {
      amount: toGrosze(codAmount),
      ...(options.cod.bankAccount ? { bankaccount: options.cod.bankAccount.replace(/\s/g, "") } : {}),
      ...(options.cod.bankAccountId ? { bankaccount_id: options.cod.bankAccountId } : {}),
    }
  }

  // Declared value (insurance). Carriers expect it to cover the COD amount.
  const declared = overrides.declared_value ?? declaredValue(options, input.itemsValue)
  const declaredGrosze = Math.max(declared ? toGrosze(declared) : 0, order.cod?.amount ?? 0)
  if (declaredGrosze > 0) {
    order.shipment_value = declaredGrosze
  }

  const additional = { ...scoped.additionalServices, ...overrides.options }
  if (Object.keys(additional).length) {
    order.option = additional
  }

  if (options.notifications) {
    order.notification = options.notifications
  }
  if (options.labelFormat === "zpl") {
    order.is_zebra = true
  }
  if (input.purpose === "shipment" && options.webhooks.backendUrl) {
    order.push_tracking_url = options.webhooks.backendUrl.replace(/\/+$/, "") + WEBHOOK_PATH
  }

  if (options.transformOrder) {
    return options.transformOrder(order, {
      purpose: input.purpose,
      serviceId,
      isReturn,
      orderId: input.orderId,
      cartId: input.cartId,
    })
  }

  return order
}

function declaredValue(options: ApaczkaPluginOptions, itemsValue?: number): number | undefined {
  switch (options.insurance.mode) {
    case "order_total":
      return itemsValue
    case "fixed":
      return options.insurance.amount
    default:
      return undefined
  }
}

/** Replaces `{display_id}`, `{order_id}` and `{items}` placeholders. */
export function renderTemplate(template: string, input: Pick<BuildOrderInput, "displayId" | "orderId" | "items">): string {
  const items = input.items
    .map((item) => (item.title ? `${item.quantity}× ${item.title}` : ""))
    .filter(Boolean)
    .join(", ")

  return template
    .replace(/\{display_id\}/g, String(input.displayId ?? ""))
    .replace(/\{order_id\}/g, input.orderId ?? "")
    .replace(/\{items\}/g, items)
    .replace(/\s*#\s*$/, "")
    .trim()
    .slice(0, 255)
}
