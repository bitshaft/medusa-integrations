import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { customerAddress, warehouseAddress } from "../../../../../../lib/addresses"
import { buildOrderPayload } from "../../../../../../lib/order-builder"
import { buildParcels } from "../../../../../../lib/parcels"
import { optionsForService } from "../../../../../../lib/options"
import { codAmountForContext, loadShipmentContext } from "../../../../../../workflows/steps/load-shipment-context"
import { resolveApaczka } from "../../../../../utils"
import type { AdminCreateShipment } from "../../../../../validators"

/**
 * `POST /admin/apaczka/fulfillments/:id/valuation` — price the shipment with
 * the given overrides before creating it. Returns the quote for the chosen
 * service plus the defaults the form should start from.
 */
export async function POST(req: MedusaRequest<AdminCreateShipment>, res: MedusaResponse) {
  const apaczka = resolveApaczka(req)
  const options = await apaczka.getOptions()
  const context = await loadShipmentContext(req.scope, req.params.id)
  const overrides = req.validatedBody.overrides ?? {}
  const serviceId = overrides.service_id ?? context.option.service_id

  const items = context.items.map((item) => ({
    title: item.title,
    quantity: item.quantity,
    weight: item.variant?.weight,
    length: item.variant?.length,
    width: item.variant?.width,
    height: item.variant?.height,
  }))
  const itemsValue = context.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  const payload = await buildOrderPayload({
    options,
    option: context.option,
    purpose: "valuation",
    warehouse: warehouseAddress({
      location: context.location,
      defaults: options.sender,
      overrides: context.location_id ? options.senderByLocation[context.location_id] : undefined,
    }),
    customer: customerAddress(
      context.customer_address,
      context.email,
      context.option.is_return ? undefined : (overrides.point_id ?? context.data.point_id)
    ),
    items,
    itemsValue,
    codAmount:
      context.option.cod && !context.option.is_return
        ? codAmountForContext(context, options.pricing.exchangeRates)
        : undefined,
    overrides,
    displayId: context.display_id ?? undefined,
    orderId: context.order_id ?? undefined,
  })

  const valuation = await (await apaczka.getClient()).valuateOrder(payload)
  const quote = valuation.price_table?.[String(serviceId)]
  if (!quote) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Apaczka service ${serviceId} cannot carry this shipment. Check the parcels and addresses.`
    )
  }

  res.json({
    service_id: serviceId,
    price_net: Number(quote.price),
    price_gross: Number(quote.price_gross),
    currency_code: "pln",
    defaults: {
      parcels: buildParcels({ items, options: optionsForService(options, serviceId).parcel }).map((parcel) => ({
        weight: parcel.weight,
        length: parcel.dimension1,
        width: parcel.dimension2,
        height: parcel.dimension3,
        package_type: parcel.shipment_type_code,
        non_standard: parcel.is_nstd === 1,
      })),
      cod_amount: payload.cod ? payload.cod.amount / 100 : 0,
      declared_value: payload.shipment_value ? payload.shipment_value / 100 : 0,
      point_id: payload.address.receiver.foreign_address_id ?? null,
    },
    sender_postal_code: payload.address.sender.postal_code,
    option: context.option,
  })
}
