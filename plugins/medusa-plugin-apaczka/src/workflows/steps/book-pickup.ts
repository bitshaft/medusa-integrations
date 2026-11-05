import type { Logger } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { TERMINAL_STATUSES, type ShipmentStatus } from "../../lib/apaczka/statuses"
import { APACZKA_MODULE } from "../../modules/apaczka"
import type ApaczkaModuleService from "../../modules/apaczka/service"

export type BookPickupInput = {
  shipment_ids: string[]
  /** `YYYY-MM-DD` */
  date: string
  /** `HH:MM` */
  hour_from: string
  hour_to: string
}

export const bookPickupStepId = "apaczka-book-pickup"

/**
 * Orders a courier pickup: `pickup/{id}/` for one shipment, `batch_pickup/`
 * for several (same sender and service required by Apaczka).
 *
 * The Apaczka API cannot cancel a pickup, so a failure later in the workflow
 * only restores the local records; the booked pickup must be canceled in
 * the Apaczka panel.
 */
export const bookPickupStep = createStep(
  bookPickupStepId,
  async (input: BookPickupInput, { container }) => {
    const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)

    if (!input.shipment_ids.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Select at least one shipment")
    }

    const shipments = await apaczka.listApaczkaShipments({ id: input.shipment_ids })
    const missing = input.shipment_ids.filter((id) => !shipments.some((s) => s.id === id))
    if (missing.length) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Shipments not found: ${missing.join(", ")}`)
    }

    const invalid = shipments.filter(
      (s) => !s.apaczka_order_id || TERMINAL_STATUSES.has(s.status as ShipmentStatus)
    )
    if (invalid.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `These shipments cannot get a pickup (not created in Apaczka, or already finished): ${invalid
          .map((s) => s.id)
          .join(", ")}`
      )
    }

    const window = { date: input.date, hour_from: input.hour_from, hour_to: input.hour_to }
    const client = apaczka.getClient()
    const result =
      shipments.length === 1
        ? await client.orderPickup(shipments[0].apaczka_order_id!, window)
        : await client.batchPickup({ ...window, order_ids: shipments.map((s) => Number(s.apaczka_order_id)) })

    const pickupNumber = result?.foreign_courier_id ? String(result.foreign_courier_id) : null
    logger.info(
      `[apaczka] Courier pickup booked for ${input.date} ${input.hour_from}-${input.hour_to}: ` +
        shipments.map((s) => s.apaczka_order_id).join(", ")
    )

    const previous = shipments.map((s) => ({
      id: s.id,
      pickup_type: s.pickup_type,
      pickup_date: s.pickup_date,
      pickup_number: s.pickup_number,
    }))

    const updated = await apaczka.updateApaczkaShipments(
      shipments.map((s) => ({
        id: s.id,
        pickup_type: "COURIER",
        pickup_date: input.date,
        pickup_number: pickupNumber,
      }))
    )

    return new StepResponse({ shipments: updated, pickup_number: pickupNumber }, previous)
  },
  async (previous, { container }) => {
    if (!previous?.length) {
      return
    }
    const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
    await apaczka.updateApaczkaShipments(previous)
    logger.warn("[apaczka] Pickup workflow rolled back; cancel the booked pickup in the Apaczka panel if needed")
  }
)
