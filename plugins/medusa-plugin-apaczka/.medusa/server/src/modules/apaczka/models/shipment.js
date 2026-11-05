"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApaczkaShipment = void 0;
const utils_1 = require("@medusajs/framework/utils");
const statuses_1 = require("../../../lib/apaczka/statuses");
const tracking_event_1 = require("./tracking-event");
/**
 * One Apaczka order, mirrored for a Medusa fulfillment.
 *
 * Medusa keeps the essentials on `fulfillment.data`; this table adds what
 * the admin and webhooks need to query efficiently (by Apaczka order ID or
 * waybill) and the tracking history.
 */
exports.ApaczkaShipment = utils_1.model
    .define("apaczka_shipment", {
    id: utils_1.model.id({ prefix: "apzship" }).primaryKey(),
    fulfillment_id: utils_1.model.text(),
    order_id: utils_1.model.text().nullable(),
    return_id: utils_1.model.text().nullable(),
    apaczka_order_id: utils_1.model.text().nullable(),
    waybill_number: utils_1.model.text().nullable(),
    tracking_url: utils_1.model.text().nullable(),
    service_id: utils_1.model.number(),
    service_name: utils_1.model.text().nullable(),
    supplier: utils_1.model.text().nullable(),
    status: utils_1.model.enum(Object.values(statuses_1.ShipmentStatus)).default(statuses_1.ShipmentStatus.PENDING),
    /** Last raw status from Apaczka, for support staff. */
    raw_status: utils_1.model.text().nullable(),
    is_return: utils_1.model.boolean().default(false),
    is_cod: utils_1.model.boolean().default(false),
    point_id: utils_1.model.text().nullable(),
    label_format: utils_1.model.enum(["pdf", "zpl"]).default("pdf"),
    /** Grosze. */
    price_net: utils_1.model.number().nullable(),
    price_gross: utils_1.model.number().nullable(),
    cod_amount: utils_1.model.number().nullable(),
    declared_value: utils_1.model.number().nullable(),
    pickup_type: utils_1.model.text().nullable(),
    pickup_date: utils_1.model.text().nullable(),
    pickup_number: utils_1.model.text().nullable(),
    shipped_at: utils_1.model.dateTime().nullable(),
    delivered_at: utils_1.model.dateTime().nullable(),
    canceled_at: utils_1.model.dateTime().nullable(),
    last_event_at: utils_1.model.dateTime().nullable(),
    last_synced_at: utils_1.model.dateTime().nullable(),
    error: utils_1.model.text().nullable(),
    metadata: utils_1.model.json().nullable(),
    events: utils_1.model.hasMany(() => tracking_event_1.ApaczkaTrackingEvent, { mappedBy: "shipment" }),
})
    .cascades({ delete: ["events"] })
    .indexes([
    { on: ["fulfillment_id"], unique: true, where: "deleted_at IS NULL" },
    { on: ["apaczka_order_id"], where: "deleted_at IS NULL AND apaczka_order_id IS NOT NULL" },
    { on: ["waybill_number"], where: "deleted_at IS NULL AND waybill_number IS NOT NULL" },
    { on: ["order_id"], where: "deleted_at IS NULL" },
    { on: ["status"], where: "deleted_at IS NULL" },
]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hpcG1lbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9hcGFjemthL21vZGVscy9zaGlwbWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxxREFBaUQ7QUFFakQsNERBQThEO0FBQzlELHFEQUF1RDtBQUV2RDs7Ozs7O0dBTUc7QUFDVSxRQUFBLGVBQWUsR0FBRyxhQUFLO0tBQ2pDLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRTtJQUMxQixFQUFFLEVBQUUsYUFBSyxDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLFVBQVUsRUFBRTtJQUNoRCxjQUFjLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRTtJQUM1QixRQUFRLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNqQyxTQUFTLEVBQUUsYUFBSyxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUNsQyxnQkFBZ0IsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3pDLGNBQWMsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3ZDLFlBQVksRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3JDLFVBQVUsRUFBRSxhQUFLLENBQUMsTUFBTSxFQUFFO0lBQzFCLFlBQVksRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ3JDLFFBQVEsRUFBRSxhQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFO0lBQ2pDLE1BQU0sRUFBRSxhQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMseUJBQWMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLHlCQUFjLENBQUMsT0FBTyxDQUFDO0lBQ2pGLHVEQUF1RDtJQUN2RCxVQUFVLEVB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