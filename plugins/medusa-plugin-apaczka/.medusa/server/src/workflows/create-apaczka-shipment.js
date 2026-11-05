"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApaczkaShipmentWorkflow = exports.createApaczkaShipmentWorkflowId = void 0;
const core_flows_1 = require("@medusajs/medusa/core-flows");
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const events_1 = require("../lib/events");
const create_apaczka_order_1 = require("./steps/create-apaczka-order");
const load_shipment_context_1 = require("./steps/load-shipment-context");
const upsert_shipment_record_1 = require("./steps/upsert-shipment-record");
exports.createApaczkaShipmentWorkflowId = "apaczka-create-shipment";
/**
 * Creates the Apaczka order for an existing fulfillment (manual mode, return
 * labels, or a retry after the automatic attempt was deferred), then stores
 * the result on the fulfillment and in the shipment table.
 *
 * Every step compensates: if anything after `order_send` fails, the Apaczka
 * order is canceled again.
 *
 * @example
 * await createApaczkaShipmentWorkflow(container).run({
 *   input: { fulfillment_id: "ful_123", overrides: { parcels: [{ weight: 2, length: 30, width: 20, height: 10 }] } },
 * })
 */
exports.createApaczkaShipmentWorkflow = (0, workflows_sdk_1.createWorkflow)(exports.createApaczkaShipmentWorkflowId, (input) => {
    const context = (0, load_shipment_context_1.loadShipmentContextStep)({ fulfillment_id: input.fulfillment_id });
    const created = (0, create_apaczka_order_1.createApaczkaOrderStep)({
        context,
        overrides: input.overrides,
        sender: input.sender,
    });
    const fulfillmentUpdate = (0, workflows_sdk_1.transform)({ context, created }, ({ context, created }) => ({
        id: context.fulfillment_id,
        data: { ...context.data, apaczka: created.state },
        labels: created.labels,
    }));
    core_flows_1.updateFulfillmentWorkflow.runAsStep({ input: fulfillmentUpdate });
    const recordInput = (0, workflows_sdk_1.transform)({ context, created }, ({ context, created }) => ({
        fulfillment_id: context.fulfillment_id,
        order_id: context.order_id,
        return_id: context.return_id,
        state: created.state,
        pickup: created.payload.pickup
            ? {
                type: created.payload.pickup.type,
                date: created.payload.pickup.type === "COURIER" ? created.payload.pickup.date : undefined,
            }
            : null,
    }));
    const shipment = (0, upsert_shipment_record_1.upsertShipmentRecordStep)(recordInput);
    const eventData = (0, workflows_sdk_1.transform)({ shipment, context }, ({ shipment, context }) => ({
        id: shipment.id,
        fulfillment_id: context.fulfillment_id,
        order_id: context.order_id,
        status: shipment.status,
        waybill_number: shipment.waybill_number,
        tracking_url: shipment.tracking_url,
        is_return: shipment.is_return,
    }));
    (0, core_flows_1.emitEventStep)({ eventName: events_1.ApaczkaEvents.SHIPMENT_CREATED, data: eventData });
    return new workflows_sdk_1.WorkflowResponse(shipment);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWFwYWN6a2Etc2hpcG1lbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvd29ya2Zsb3dzL2NyZWF0ZS1hcGFjemthLXNoaXBtZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDREQUFzRjtBQUN0RixxRUFBK0Y7QUFJL0YsMENBQTRFO0FBQzVFLHVFQUFxRTtBQUNyRSx5RUFBdUU7QUFDdkUsMkVBQXlFO0FBVzVELFFBQUEsK0JBQStCLEdBQUcseUJBQXlCLENBQUE7QUFFeEU7Ozs7Ozs7Ozs7OztHQVlHO0FBQ1UsUUFBQSw2QkFBNkIsR0FBRyxJQUFBLDhCQUFjLEVBQ3pELHVDQUErQixFQUMvQixDQUFDLEtBQXlDLEVBQUUsRUFBRTtJQUM1QyxNQUFNLE9BQU8sR0FBRyxJQUFBLCtDQUF1QixFQUFDLEVBQUUsY0FBYyxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFBO0lBRWpGLE1BQU0sT0FBTyxHQUFHLElBQUEsNkNBQXNCLEVBQUM7UUFDckMsT0FBTztRQUNQLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztRQUMxQixNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU07S0FDckIsQ0FBQyxDQUFBO0lBRUYsTUFBTSxpQkFBaUIsR0FBRyxJQUFBLHlCQUFTLEVBQUMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNuRixFQUFFLEVBQUUsT0FBTyxDQUFDLGNBQWM7UUFDMUIsSUFBSSxFQUFFLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsS0FBSyxFQUFFO1FBQ2pELE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTTtLQUN2QixDQUFDLENBQUMsQ0FBQTtJQUNILHNDQUF5QixDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDLENBQUE7SUFFakUsTUFBTSxXQUFXLEdBQUcsSUFBQSx5QkFBUyxFQUFDLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDN0UsY0FBYyxFQUFFLE9BQU8sQ0FBQyxjQUFjO1FBQ3RDLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUTtRQUMxQixTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVM7UUFDNUIsS0FBSyxFQUFFLE9BQU8sQ0FBQyxLQUFLO1FBQ3BCLE1BQU0sRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU07WUFDNUIsQ0FBQyxDQUFDO2dCQUNFLElBQUksRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJO2dCQUNqQyxJQUFJLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTO2FBQzFGO1lBQ0gsQ0FBQyxDQUFDLElBQUk7S0FDVCxDQUFDLENBQUMsQ0FBQTtJQUNILE1BQU0sUUFBUSxHQUFHLElBQUEsaURBQXdCLEVBQUMsV0FBVyxDQUFDLENBQUE7SUFFdEQsTUFBTSxTQUFTLEdBQUcsSUFBQSx5QkFBUyxFQUFDLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEVBQTRCLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZHLEVBQUUsRUFBRSxRQUFRLENBQUMsRUFBRTtRQUNmLGNBQWMsRUFBRSxPQUFPLENBQUMsY0FBYztRQUN0QyxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVE7UUFDMUIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNO1FBQ3ZCLGNBQWMsRUFBRSxRQUFRLENBQUMsY0FBYztRQUN2QyxZQUFZLEVBQUUsUUFBUSxDQUFDLFlBQVk7UUFDbkMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxTQUFTO0tBQzlCLENBQUMsQ0FBQyxDQUFBO0lBQ0gsSUFBQSwwQkFBYSxFQUFDLEVBQUUsU0FBUyxFQUFFLHNCQUFhLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUE7SUFFN0UsT0FBTyxJQUFJLGdDQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFBO0FBQ3ZDLENBQUMsQ0FDRixDQUFBIn0=