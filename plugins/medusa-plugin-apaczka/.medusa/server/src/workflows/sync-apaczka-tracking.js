"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncApaczkaTrackingWorkflow = exports.syncApaczkaTrackingWorkflowId = void 0;
const core_flows_1 = require("@medusajs/medusa/core-flows");
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const statuses_1 = require("../lib/apaczka/statuses");
const events_1 = require("../lib/events");
const apply_tracking_events_1 = require("./steps/apply-tracking-events");
const emit_events_1 = require("./steps/emit-events");
exports.syncApaczkaTrackingWorkflowId = "apaczka-sync-tracking";
const STATUS_EVENTS = {
    [statuses_1.ShipmentStatus.POSTED]: events_1.ApaczkaEvents.SHIPPED,
    [statuses_1.ShipmentStatus.READY_FOR_PICKUP]: events_1.ApaczkaEvents.READY_FOR_PICKUP,
    [statuses_1.ShipmentStatus.DELIVERED]: events_1.ApaczkaEvents.DELIVERED,
    [statuses_1.ShipmentStatus.EXCEPTION]: events_1.ApaczkaEvents.EXCEPTION,
    [statuses_1.ShipmentStatus.RETURNED]: events_1.ApaczkaEvents.RETURNED,
    [statuses_1.ShipmentStatus.CANCELED]: events_1.ApaczkaEvents.CANCELED,
};
/**
 * Applies tracking events (from a webhook or polling) to a shipment and,
 * when enabled in the options, marks the Medusa fulfillment as shipped and
 * delivered. Emits `apaczka.shipment.status_changed` plus a specific event
 * (`…delivered`, `…exception`, …) when the status moves.
 */
exports.syncApaczkaTrackingWorkflow = (0, workflows_sdk_1.createWorkflow)(exports.syncApaczkaTrackingWorkflowId, (input) => {
    const result = (0, apply_tracking_events_1.applyTrackingEventsStep)(input);
    (0, workflows_sdk_1.when)("apaczka-mark-shipped", result, (r) => r.mark_shipped).then(() => {
        const shipmentInput = (0, workflows_sdk_1.transform)({ result }, ({ result }) => ({
            order_id: result.order_id,
            fulfillment_id: result.fulfillment_id,
            items: result.shipment_items,
        }));
        core_flows_1.createOrderShipmentWorkflow.runAsStep({ input: shipmentInput });
    });
    (0, workflows_sdk_1.when)("apaczka-mark-delivered", result, (r) => r.mark_delivered).then(() => {
        const deliveredInput = (0, workflows_sdk_1.transform)({ result }, ({ result }) => ({
            orderId: result.order_id,
            fulfillmentId: result.fulfillment_id,
        }));
        core_flows_1.markOrderFulfillmentAsDeliveredWorkflow.runAsStep({ input: deliveredInput });
    });
    (0, workflows_sdk_1.when)("apaczka-status-changed", result, (r) => r.changed).then(() => {
        const events = (0, workflows_sdk_1.transform)({ result }, ({ result }) => {
            const data = {
                id: result.shipment_id,
                fulfillment_id: result.fulfillment_id,
                order_id: result.order_id,
                status: result.status,
                previous_status: result.previous_status,
                waybill_number: result.waybill_number,
                tracking_url: result.tracking_url,
                is_return: result.is_return,
            };
            const specific = STATUS_EVENTS[result.status];
            return [
                { name: events_1.ApaczkaEvents.STATUS_CHANGED, data },
                ...(specific ? [{ name: specific, data }] : []),
            ];
        });
        (0, emit_events_1.emitEventsStep)(events);
    });
    return new workflows_sdk_1.WorkflowResponse(result);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1hcGFjemthLXRyYWNraW5nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3dvcmtmbG93cy9zeW5jLWFwYWN6a2EtdHJhY2tpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNERBQWtIO0FBQ2xILHFFQUFxRztBQUVyRyxzREFBd0Q7QUFDeEQsMENBQTRFO0FBRTVFLHlFQUF1RTtBQUN2RSxxREFBb0Q7QUFPdkMsUUFBQSw2QkFBNkIsR0FBRyx1QkFBdUIsQ0FBQTtBQUVwRSxNQUFNLGFBQWEsR0FBNEM7SUFDN0QsQ0FBQyx5QkFBYyxDQUFDLE1BQU0sQ0FBQyxFQUFFLHNCQUFhLENBQUMsT0FBTztJQUM5QyxDQUFDLHlCQUFjLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxzQkFBYSxDQUFDLGdCQUFnQjtJQUNqRSxDQUFDLHlCQUFjLENBQUMsU0FBUyxDQUFDLEVBQUUsc0JBQWEsQ0FBQyxTQUFTO0lBQ25ELENBQUMseUJBQWMsQ0FBQyxTQUFTLENBQUMsRUFBRSxzQkFBYSxDQUFDLFNBQVM7SUFDbkQsQ0FBQyx5QkFBYyxDQUFDLFFBQVEsQ0FBQyxFQUFFLHNCQUFhLENBQUMsUUFBUTtJQUNqRCxDQUFDLHlCQUFjLENBQUMsUUFBUSxDQUFDLEVBQUUsc0JBQWEsQ0FBQyxRQUFRO0NBQ2xELENBQUE7QUFFRDs7Ozs7R0FLRztBQUNVLFFBQUEsMkJBQTJCLEdBQUcsSUFBQSw4QkFBYyxFQUN2RCxxQ0FBNkIsRUFDN0IsQ0FBQyxLQUF1QyxFQUFFLEVBQUU7SUFDMUMsTUFBTSxNQUFNLEdBQUcsSUFBQSwrQ0FBdUIsRUFBQyxLQUFLLENBQUMsQ0FBQTtJQUU3QyxJQUFBLG9CQUFJLEVBQUMsc0JBQXNCLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtRQUNwRSxNQUFNLGFBQWEsR0FBRyxJQUFB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