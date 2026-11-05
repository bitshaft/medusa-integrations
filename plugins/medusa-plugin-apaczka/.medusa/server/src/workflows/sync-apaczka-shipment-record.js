"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncApaczkaShipmentRecordWorkflow = exports.syncApaczkaShipmentRecordWorkflowId = void 0;
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const utils_1 = require("@medusajs/framework/utils");
const statuses_1 = require("../lib/apaczka/statuses");
const data_1 = require("../lib/data");
const events_1 = require("../lib/events");
const emit_events_1 = require("./steps/emit-events");
const upsert_shipment_record_1 = require("./steps/upsert-shipment-record");
const readFulfillmentStep = (0, workflows_sdk_1.createStep)("apaczka-read-fulfillment-state", async (input, { container }) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luYy1hcGFjemthLXNoaXBtZW50LXJlY29yZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy93b3JrZmxvd3Mvc3luYy1hcGFjemthLXNoaXBtZW50LXJlY29yZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxxRUFBK0g7QUFDL0gscURBQXFFO0FBRXJFLHNEQUF3RDtBQUN4RCxzQ0FBK0U7QUFDL0UsMENBQTZDO0FBQzdDLHFEQUFvRDtBQUNwRCwyRUFBeUU7QUFhekUsTUFBTSxtQkFBbUIsR0FBRyxJQUFBLDBCQUFVLEVBQ3BDLGdDQUFnQyxFQUNoQyxLQUFLLEVBQUUsS0FBcUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7SUFDN0QsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxpQ0FBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUNoRSxNQUFNLEVBQ0osSUFBSSxFQUFFLENBQUMsV0FBVyxDQUFDLEdBQ3BCLEdBQUcsTUFBTSxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQ3BCLE1BQU0sRUFBRSxhQUFhO1FBQ3JCLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsY0FBYyxFQUFFO1FBQ3JDLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsaUJBQWlCLEVBQUUscUJBQXFCLENBQUM7S0FDekcsQ0FBQyxDQUFBO0lBRUYsTUFBTSxLQUFLLEdBQUcsSUFBQSwwQkFBbUIsRUFBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQTtJQUNwRSxNQUFNLEdBQUcsR0FBSSxXQUFnRixFQUFFLE1BQU0sQ0FBQTtJQUNyRyxNQUFNLFFBQVEsR0FBd0I7UUFDcEMsY0FBYyxFQUFFLEtBQUssQ0FBQyxjQUFjO1FBQ3BDLFFBQVEsRUFBRyxXQUE2RCxFQUFFLEtBQUssRUFBRSxF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