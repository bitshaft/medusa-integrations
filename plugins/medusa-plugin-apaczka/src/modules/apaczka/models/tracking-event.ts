import { model } from "@medusajs/framework/utils"

import { ShipmentStatus } from "../../../lib/apaczka/client/statuses"
import { ApaczkaShipment } from "./shipment"

/**
 * One status change of a shipment. `fingerprint` makes ingestion idempotent:
 * Apaczka redelivers webhooks until it gets HTTP 200, and polling returns the
 * full history every time.
 */
export const ApaczkaTrackingEvent = model
  .define("apaczka_tracking_event", {
    id: model.id({ prefix: "apzevt" }).primaryKey(),
    source: model.enum(["webhook", "polling", "system"]),
    status: model.enum(Object.values(ShipmentStatus)),
    raw_status: model.text(),
    description: model.text().nullable(),
    place: model.text().nullable(),
    occurred_at: model.dateTime(),
    fingerprint: model.text(),
    shipment: model.belongsTo(() => ApaczkaShipment, { mappedBy: "events" }),
  })
  .indexes([
    { on: ["shipment_id", "fingerprint"], unique: true, where: "deleted_at IS NULL" },
    { on: ["shipment_id", "occurred_at"], where: "deleted_at IS NULL" },
  ])
