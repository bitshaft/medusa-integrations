import type { Logger } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { assertCompleteAddress, customerAddress, warehouseAddress } from "../../../lib/apaczka/addresses"
import type { ApaczkaAddress } from "../../../lib/apaczka/client"
import type { ShipmentOverrides } from "../../../lib/apaczka/data"
import { exchangeRate } from "../../../lib/apaczka/money"
import { type CreatedShipment, createShipment } from "../../../lib/apaczka/shipments"
import { APACZKA_MODULE } from "../../../modules/apaczka"
import type ApaczkaModuleService from "../../../modules/apaczka/service"
import { codAmountForContext, type ShipmentContext } from "./load-shipment-context"

export type CreateApaczkaOrderStepInput = {
  context: ShipmentContext
  overrides?: ShipmentOverrides
  /** Replaces the sender resolved from the stock location. */
  sender?: ApaczkaAddress
}

export const createApaczkaOrderStepId = "apaczka-create-order"

/**
 * Sends the order to Apaczka. If a later step fails, the order is canceled
 * so no orphaned shipment is left behind.
 */
export const createApaczkaOrderStep = createStep(
  createApaczkaOrderStepId,
  async (input: CreateApaczkaOrderStepInput, { container }) => {
    const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
    const options = await apaczka.getOptions()
    const { context } = input

    if (context.canceled) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Fulfillment ${context.fulfillment_id} is canceled`)
    }
    if (context.data.apaczka?.state === "created" && context.data.apaczka.order_id) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Fulfillment ${context.fulfillment_id} already has Apaczka order ${context.data.apaczka.order_id}`
      )
    }

    const warehouse =
      input.sender ??
      warehouseAddress({
        location: context.location,
        defaults: options.sender,
        overrides: context.location_id ? options.senderByLocation[context.location_id] : undefined,
      })
    assertCompleteAddress(warehouse, context.option.is_return ? "receiver" : "sender")

    const customer = customerAddress(
      context.customer_address,
      context.email,
      context.option.is_return ? undefined : (input.overrides?.point_id ?? context.data.point_id)
    )
    assertCompleteAddress(customer, context.option.is_return ? "sender" : "receiver")

    // Apaczka works in PLN: an order in another currency is converted, as for the quote.
    const itemsValue =
      context.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) /
      exchangeRate(context.cod.currency_code, options.pricing.exchangeRates)

    const created = await createShipment({
      client: await apaczka.getClient(),
      logger,
      build: {
        options,
        option: context.option,
        warehouse,
        customer,
        items: context.items.map((item) => ({
          title: item.title,
          quantity: item.quantity,
          weight: item.variant?.weight,
          length: item.variant?.length,
          width: item.variant?.width,
          height: item.variant?.height,
        })),
        itemsValue,
        codAmount:
          context.option.cod && !context.option.is_return
            ? codAmountForContext(context, options.pricing.exchangeRates)
            : undefined,
        overrides: input.overrides,
        displayId: context.display_id ?? undefined,
        orderId: context.order_id ?? undefined,
      },
    })

    logger.info(
      `[apaczka] Created order ${created.state.order_id} for fulfillment ${context.fulfillment_id}` +
        (context.option.is_return ? " (return)" : "")
    )

    return new StepResponse<CreatedShipment, number>(created, created.state.order_id ?? 0)
  },
  async (apaczkaOrderId: number | undefined, { container }) => {
    if (!apaczkaOrderId) {
      return
    }
    const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
    try {
      await (await apaczka.getClient()).cancelOrder(apaczkaOrderId)
      logger.warn(`[apaczka] Rolled back: canceled Apaczka order ${apaczkaOrderId}`)
    } catch (error) {
      logger.error(
        `[apaczka] Rollback failed: cancel Apaczka order ${apaczkaOrderId} manually in the Apaczka panel (${(error as Error).message})`
      )
    }
  }
)
