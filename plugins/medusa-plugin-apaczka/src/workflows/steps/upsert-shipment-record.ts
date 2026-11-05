import type { InferTypeOf } from "@medusajs/framework/types"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import type { ApaczkaFulfillmentState } from "../../lib/data"
import { APACZKA_MODULE } from "../../modules/apaczka"
import { ApaczkaShipment } from "../../modules/apaczka/models/shipment"
import type ApaczkaModuleService from "../../modules/apaczka/service"

export type UpsertShipmentRecordInput = {
  fulfillment_id: string
  order_id?: string | null
  return_id?: string | null
  state: ApaczkaFulfillmentState
  pickup?: { type: string; date?: string } | null
}

type ShipmentRecord = InferTypeOf<typeof ApaczkaShipment>
type Compensation = { created: true; id: string } | { created: false; previous: ShipmentRecord }

export const upsertShipmentRecordStepId = "apaczka-upsert-shipment-record"

/** Creates or updates the `apaczka_shipment` row for a fulfillment. */
export const upsertShipmentRecordStep = createStep(
  upsertShipmentRecordStepId,
  async (input: UpsertShipmentRecordInput, { container }) => {
    const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
    const values = toRecord(input)

    const [existing] = await apaczka.listApaczkaShipments({ fulfillment_id: input.fulfillment_id })
    if (existing) {
      const updated = (await apaczka.updateApaczkaShipments({ id: existing.id, ...values })) as ShipmentRecord
      return new StepResponse<ShipmentRecord, Compensation>(updated, { created: false, previous: existing as unknown as ShipmentRecord })
    }

    const created = (await apaczka.createApaczkaShipments(values)) as ShipmentRecord
    return new StepResponse<ShipmentRecord, Compensation>(created, { created: true, id: created.id })
  },
  async (compensation: Compensation | undefined, { container }) => {
    if (!compensation) {
      return
    }
    const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
    if (compensation.created) {
      await apaczka.deleteApaczkaShipments(compensation.id)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { events, created_at, updated_at, deleted_at, ...previous } = compensation.previous as unknown as Record<string, unknown>
    await apaczka.updateApaczkaShipments(previous as never)
  }
)

export function toRecord(input: UpsertShipmentRecordInput) {
  const { state } = input
  return {
    fulfillment_id: input.fulfillment_id,
    order_id: input.order_id ?? null,
    return_id: input.return_id ?? null,
    apaczka_order_id: state.order_id ? String(state.order_id) : null,
    waybill_number: state.waybill_number ?? null,
    tracking_url: state.tracking_url ?? null,
    service_id: state.service_id,
    service_name: state.service_name ?? null,
    supplier: state.supplier ?? null,
    status: state.status ?? (state.state === "pending" ? "pending" : "created"),
    is_return: state.is_return,
    is_cod: state.cod,
    point_id: state.point_id ?? null,
    label_format: state.label_format,
    price_net: state.price_net ?? null,
    price_gross: state.price_gross ?? null,
    cod_amount: state.cod_amount ?? null,
    declared_value: state.declared_value ?? null,
    pickup_type: input.pickup?.type ?? null,
    pickup_date: input.pickup?.date ?? null,
    error: state.error ?? null,
  } as const
}
