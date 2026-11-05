"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncApaczkaShipmentRecordWorkflow = exports.syncApaczkaShipmentRecordWorkflowId = exports.readFulfillmentStateStepId = void 0;
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const utils_1 = require("@medusajs/framework/utils");
const statuses_1 = require("../lib/apaczka/statuses");
const data_1 = require("../lib/data");
const events_1 = require("../lib/events");
const emit_events_1 = require("./steps/emit-events");
const upsert_shipment_record_1 = require("./steps/upsert-shipment-record");
exports.readFulfillmentStateStepId = "apaczka-read-fulfillment-state";
const readFulfillmentStep = (0, workflows_sdk_1.createStep)(exports.readFulfillmentStateStepId, async (input, { container }) => {
    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const { data: [fulfillment], } = await query.graph({
        entity: "fulfillment",
        filters: { id: input.fulfillment_id },
        fields: ["id", "data", "canceled_at", "order.id", "return.id", "return.order_id", "apaczka_shipment.id"],
    });
    const state = (0, data_1.readFulfillmentData)(fulfillment?.data).apaczka ?? null;
    const ret = fulfillment?.return;
    const snapshot = {
        fulfillment_id: input.fulfillment_id,
        order_id: fulfillment?.order?.id ?? ret?.order_id ?? null,
        return_id: ret?.id ?? null,
        state: state && fulfillment?.canceled_at ? { ...state, state: "canceled", status: statuses_1.ShipmentStatus.CANCELED } : state,
        canceled: Boolean(fulfillment?.canceled_at),
        existed: Boolean(fulfillment?.apaczka_shipment?.id),
    };
    return new workflows_sdk_1.StepResponse(snapshot);
});
exports.syncApaczkaShipmentRecordWorkflowId = "apaczka-sync-shipment-record";
/**
 * Mirrors `fulfillment.data.apaczka` into the shipment table. Runs after
 * Medusa creates or cancels an Apaczka fulfillment (see the subscribers).
 * Does nothing for fulfillments of other providers.
 */
exports.syncApaczkaShipmentRecordWorkflow = (0, workflows_sdk_1.createWorkflow)(exports.syncApaczkaShipmentRecordWorkflowId, (input) => {
    const snapshot = readFulfillmentStep(input);
    const shipment = (0, workflows_sdk_1.when)("apaczka-has-state", snapshot, (s) => Boolean(s.state)).then(() => {
        const recordInput = (0, workflows_sdk_1.transform)({ snapshot }, ({ snapshot }) => ({
            fulfillment_id: snapshot.fulfillment_id,
            order_id: snapshot.order_id,
            return_id: snapshot.return_id,
            state: snapshot.state,
        }));
        const record = (0, upsert_shipment_record_1.upsertShipmentRecordStep)(recordInput);
        const events = (0, workflows_sdk_1.transform)({ snapshot, record }, ({ snapshot, record }) => {
            const data = {
                id: record.id,
                fulfillment_id: snapshot.fulfillment_id,
                order_id: snapshot.order_id,
                status: record.status,
                waybill_number: record.waybill_number,
                tracking_url: record.tracking_url,
                is_return: record.is_return,
            };
            if (snapshot.canceled) {
                return [{ name: events_1.ApaczkaEvents.CANCELED, data }];
            }
            if (!snapshot.existed && snapshot.state?.state === "created") {
                return [{ name: events_1.ApaczkaEvents.SHIPMENT_CREATED, data }];
            }
            return [];
        });
        (0, emit_events_1.emitEventsStep)(events);
        return record;
    });
    return new workflows_sdk_1.WorkflowResponse({ snapshot, shipment });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1hcGFjemthLXNoaXBtZW50LXJlY29yZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy93b3JrZmxvd3Mvc3luYy1hcGFjemthLXNoaXBtZW50LXJlY29yZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxxRUFPMEM7QUFDMUMscURBQXFFO0FBRXJFLHNEQUF3RDtBQUN4RCxzQ0FBK0U7QUFDL0UsMENBQTZDO0FBQzdDLHFEQUFvRDtBQUNwRCwyRUFBeUU7QUFhNUQsUUFBQSwwQkFBMEIsR0FBRyxnQ0FBZ0MsQ0FBQTtBQUUxRSxNQUFNLG1CQUFtQixHQUFHLElBQUEsMEJBQVUsRUFDcEMsa0NBQTBCLEVBQzFCLEtBQUssRUFBRSxLQUFxQyxFQUFFLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRTtJQUM3RCxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLGlDQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFBO0lBQ2hFLE1BQU0sRUFDSixJQUFJLEVBQUUsQ0FBQyxXQUFXLENBQUMsR0FDcEIsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDcEIsTUFBTSxFQUFFLGFBQWE7UUFDckIsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUU7UUFDckMsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsQ0FBQztLQUN6RyxDQUFDLENBQUE7SUFFRixNQUFNLEtBQUssR0FBRyxJQUFBLDBCQUFtQixFQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFBO0lBQ3BFLE1BQU0sR0FBRyxHQUFJLFdBQWdGLEVBQUUsTUFBTSxDQUFBO0lBQ3JHLE1BQU0sUUFBUSxHQUF3QjtRQUNwQyxjQUFjLEVBQUUsS0FBSyxDQUFDLGNBQWM7UUFD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