"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollShipmentTracking = pollShipmentTracking;
const tracking_1 = require("../../lib/tracking");
const apaczka_1 = require("../../modules/apaczka");
const sync_apaczka_tracking_1 = require("../sync-apaczka-tracking");
/**
 * Fetches tracking for one shipment from `tracking/{waybill}/` and applies
 * it. Shipments without a waybill number are only touched (`last_synced_at`).
 */
async function pollShipmentTracking(container, shipmentId) {
    const apaczka = container.resolve(apaczka_1.APACZKA_MODULE);
    const shipment = await apaczka.retrieveApaczkaShipment(shipmentId);
    const events = shipment.waybill_number
        ? (0, tracking_1.eventsFromPolling)((await apaczka.getClient().getTracking(shipment.waybill_number)).data)
        : [];
    const { result } = await (0, sync_apaczka_tracking_1.syncApaczkaTrackingWorkflow)(container).run({
        input: { shipment_id: shipment.id, events },
    });
    return {
        shipment_id: shipment.id,
        new_events: result.new_events,
        status: result.status,
        changed: result.changed,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9sbC10cmFja2luZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy93b3JrZmxvd3MvaGVscGVycy9wb2xsLXRyYWNraW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBYUEsb0RBa0JDO0FBN0JELGlEQUFzRDtBQUN0RCxtREFBc0Q7QUFFdEQsb0VBQXNFO0FBSXRFOzs7R0FHRztBQUNJLEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxTQUEwQixFQUFFLFVBQWtCO0lBQ3ZGLE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQXVCLHdCQUFjLENBQUMsQ0FBQTtJQUN2RSxNQUFNLFFBQVEsR0FBRyxNQUFNLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxVQUFVLENBQUMsQ0FBQTtJQUVsRSxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsY0FBYztRQUNwQyxDQUFDLENBQUMsSUFBQSw0QkFBaUIsRUFBQyxDQUFDLE1BQU0sT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDMUYsQ0FBQyxDQUFDLEVBQUUsQ0FBQTtJQUVOLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUEsbURBQTJCLEVBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ2xFLEtBQUssRUFBRSxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsRUFBRSxFQUFFLE1BQU0sRUFBRTtLQUM1QyxDQUFDLENBQUE7SUFFRixPQUFPO1FBQ0wsV0FBVyxFQUFFLFFBQVEsQ0FBQyxFQUFFO1FBQ3hCLFVBQVUsRUFBRSxNQUFNLENBQUMsVUFBVTtRQUM3QixNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07UUFDckIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPO0tBQ3hCLENBQUE7QUFDSCxDQUFDIn0=