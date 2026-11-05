"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApaczkaTrackingEvent = void 0;
const utils_1 = require("@medusajs/framework/utils");
const statuses_1 = require("../../../lib/apaczka/statuses");
const shipment_1 = require("./shipment");
/**
 * One status change of a shipment. `fingerprint` makes ingestion idempotent:
 * Apaczka redelivers webhooks until it gets HTTP 200, and polling returns the
 * full history every time.
 */
exports.ApaczkaTrackingEvent = utils_1.model
    .define("apaczka_tracking_event", {
    id: utils_1.model.id({ prefix: "apzevt" }).primaryKey(),
    source: utils_1.model.enum(["webhook", "polling", "system"]),
    status: utils_1.model.enum(Object.values(statuses_1.ShipmentStatus)),
    raw_status: utils_1.model.text(),
    description: utils_1.model.text().nullable(),
    place: utils_1.model.text().nullable(),
    occurred_at: utils_1.model.dateTime(),
    fingerprint: utils_1.model.text(),
    shipment: utils_1.model.belongsTo(() => shipment_1.ApaczkaShipment, { mappedBy: "events" }),
})
    .indexes([
    { on: ["shipment_id", "fingerprint"], unique: true, where: "deleted_at IS NULL" },
    { on: ["shipment_id", "occurred_at"], where: "deleted_at IS NULL" },
]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhY2tpbmctZXZlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9hcGFjemthL21vZGVscy90cmFja2luZy1ldmVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxxREFBaUQ7QUFFakQsNERBQThEO0FBQzlELHlDQUE0QztBQUU1Qzs7OztHQUlHO0FBQ1UsUUFBQSxvQkFBb0IsR0FBRyxhQUFLO0tBQ3RDLE1BQU0sQ0FBQyx3QkFBd0IsRUFBRTtJQUNoQyxFQUFFLEVBQUUsYUFBSyxDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLFVBQVUsRUFBRTtJQUMvQyxNQUFNLEVBQUUsYUFBSyxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDcEQsTUFBTSxFQUFFLGFBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyx5QkFBYyxDQUFDLENBQUM7SUFDakQsVUFBVSxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUU7SUFDeEIsV0FBVyxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDcEMsS0FBSyxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDOUIsV0FBVyxFQUFFLGFBQUssQ0FBQyxRQUFRLEVBQUU7SUFDN0IsV0FBVyxFQUFFLGFBQUssQ0FBQyxJQUFJLEVBQUU7SUFDekIsUUFBUSxFQUFFLGFBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsMEJBQWUsRUFBRSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQztDQUN6RSxDQUFDO0tBQ0QsT0FBTyxDQUFDO0lBQ1AsRUFBRSxFQUFFLEVBQUUsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUU7SUFDakYsRUFBRSxFQUFFLEVBQUUsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFO0NBQ3BFLENBQUMsQ0FBQSJ9