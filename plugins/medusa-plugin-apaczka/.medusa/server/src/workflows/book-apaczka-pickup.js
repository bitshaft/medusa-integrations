"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookApaczkaPickupWorkflow = exports.bookApaczkaPickupWorkflowId = void 0;
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const events_1 = require("../lib/events");
const book_pickup_1 = require("./steps/book-pickup");
const emit_events_1 = require("./steps/emit-events");
exports.bookApaczkaPickupWorkflowId = "apaczka-book-pickup";
/** Books a courier pickup for one or more shipments. */
exports.bookApaczkaPickupWorkflow = (0, workflows_sdk_1.createWorkflow)(exports.bookApaczkaPickupWorkflowId, (input) => {
    const result = (0, book_pickup_1.bookPickupStep)(input);
    const events = (0, workflows_sdk_1.transform)({ result, input }, ({ result, input }) => [
        {
            name: events_1.ApaczkaEvents.PICKUP_BOOKED,
            data: {
                shipment_ids: result.shipments.map((s) => s.id),
                date: input.date,
                hour_from: input.hour_from,
                hour_to: input.hour_to,
                pickup_number: result.pickup_number,
            },
        },
    ]);
    (0, emit_events_1.emitEventsStep)(events);
    return new workflows_sdk_1.WorkflowResponse(result);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9vay1hcGFjemthLXBpY2t1cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy93b3JrZmxvd3MvYm9vay1hcGFjemthLXBpY2t1cC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxxRUFBK0Y7QUFFL0YsMENBQTZDO0FBQzdDLHFEQUEwRTtBQUMxRSxxREFBb0Q7QUFJdkMsUUFBQSwyQkFBMkIsR0FBRyxxQkFBcUIsQ0FBQTtBQUVoRSx3REFBd0Q7QUFDM0MsUUFBQSx5QkFBeUIsR0FBRyxJQUFBLDhCQUFjLEVBQ3JELG1DQUEyQixFQUMzQixDQUFDLEtBQXFDLEVBQUUsRUFBRTtJQUN4QyxNQUFNLE1BQU0sR0FBRyxJQUFBLDRCQUFjLEVBQUMsS0FBSyxDQUFDLENBQUE7SUFFcEMsTUFBTSxNQUFNLEdBQUcsSUFBQSx5QkFBUyxFQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQ2pFO1lBQ0UsSUFBSSxFQUFFLHNCQUFhLENBQUMsYUFBYTtZQUNqQyxJQUFJLEVBQUU7Z0JBQ0osWUFBWSxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUMvQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7Z0JBQ2hCLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztnQkFDMUIsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPO2dCQUN0QixhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7YUFDcEM7U0FDRjtLQUNGLENBQUMsQ0FBQTtJQUNGLElBQUEsNEJBQWMsRUFBQyxNQUFNLENBQUMsQ0FBQTtJQUV0QixPQUFPLElBQUksZ0NBQWdCLENBQUMsTUFBTSxDQUFDLENBQUE7QUFDckMsQ0FBQyxDQUNGLENBQUEifQ==