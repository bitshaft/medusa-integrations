import { model } from "@medusajs/framework/utils"

import { ShipmentStatus } from "../../../lib/apaczka/statuses"
import { ApaczkaTrackingEvent } from "./tracking-event"

/**
 * One Apaczka order, mirrored for a Medusa fulfillment.
 *
 * Medusa keeps the essentials on `fulfillment.data`; this table adds what
 * the admin and webhooks need to query efficiently (by Apaczka order ID or
 * waybill) and the tracking history.
 */
export const ApaczkaShipment = model
  .define("apaczka_shipment", {
    id: model.id({ prefix: "apzship" }).primaryKey(),
    fulfillment_id: model.text(),
    order_id: model.text().nullable(),
    return_id: model.text().nullable(),
    apaczka_order_id: model.text().nullable(),
    waybill_number: model.text().nullable(),
    tracking_url: model.text().nullable(),
    service_id: model.number(),
    service_name: model.text().nullable(),
    supplier: model.text().nullable(),
    status: model.enum(Object.values(ShipmentStatus)).default(ShipmentStatus.PENDING),
    /** Last raw status from Apaczka, for support staff. */
    raw_status: model.text().nullable(),
    is_return: model.boolean().default(false),
    is_cod: model.boolean().default(false),
    point_id: model.text().nullable(),
    label_format: model.enum(["pdf", "zpl"]).default("pdf"),
    /** Grosze. */
    price_net: model.number().nullable(),
    price_gross: model.number().nullable(),
    cod_amount: model.number().nullable(),
    declared_value: model.number().nullable(),
    pickup_type: model.text().nullable(),
    pickup_date: model.text().nullable(),
    pickup_number: model.text().nullable(),
    shipped_at: model.dateTime().nullable(),
    delivered_at: model.dateTime().nullable(),
    canceled_at: model.dateTime().nullable(),
    last_event_at: model.dateTime().nullable(),
    last_synced_at: model.dateTime().nullable(),
    error: model.text().nullable(),
    metadata: model.json().nullable(),
    events: model.hasMany(() => ApaczkaTrackingEvent, { mappedBy: "shipment" }),
  })
  .cascades({ delete: ["events"] })
  .indexes([
    { on: ["fulfillment_id"], unique: true, where: "deleted_at IS NULL" },
    { on: ["apaczka_order_id"], where: "deleted_at IS NULL AND apaczka_order_id IS NOT NULL" },
    { on: ["waybill_number"], where: "deleted_at IS NULL AND waybill_number IS NOT NULL" },
    { on: ["order_id"], where: "deleted_at IS NULL" },
    { on: ["status"], where: "deleted_at IS NULL" },
  ])
