"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTrackingEventsStep = exports.applyTrackingEventsStepId = void 0;
const utils_1 = require("@medusajs/framework/utils");
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const statuses_1 = require("../../lib/apaczka/statuses");
const tracking_1 = require("../../lib/tracking");
const apaczka_1 = require("../../modules/apaczka");
exports.applyTrackingEventsStepId = "apaczka-apply-tracking-events";
/**
 * Stores new tracking events, moves the shipment to the latest status and
 * decides whether the Medusa fulfillment should be marked shipped/delivered.
 *
 * Events are deduplicated, and the status only moves to an event that is
 * newer than the last applied one, so redelivered or out-of-order webhooks
 * never move a shipment backwards.
 */
exports.applyTrackingEventsStep = (0, workflows_sdk_1.createStep)(exports.applyTrackingEventsStepId, async (input, { container }) => {
    const apaczka = container.resolve(apaczka_1.APACZKA_MODULE);
    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const options = await apaczka.getOptions();
    const shipment = await apaczka.retrieveApaczkaShipment(input.shipment_id).catch(() => null);
    if (!shipment) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_FOUND, `Apaczka shipment ${input.shipment_id} was not found`);
    }
    const fresh = await apaczka.recordTrackingEvents(shipment.id, input.events);
    const latest = (0, tracking_1.latestEvent)(fresh);
    const lastAppliedAt = shipment.last_event_at ? new Date(shipment.last_event_at) : undefined;
    const isNewer = latest && (!lastAppliedAt || latest.occurred_at > lastAppliedAt);
    const previousStatus = shipment.status;
    const status = isNewer && latest ? latest.status : previousStatus;
    const now = new Date();
    const previous = {
        id: shipment.id,
        status: shipment.status,
        raw_status: shipment.raw_status,
        last_event_at: shipment.last_event_at,
        last_synced_at: shipment.last_synced_at,
        shipped_at: shipment.shipped_at,
        delivered_at: shipment.delivered_at,
        canceled_at: shipment.canceled_at,
    };
    await apaczka.updateApaczkaShipments({
        id: shipment.id,
        last_synced_at: now,
        ...(isNewer && latest
            ? {
                status,
                raw_status: latest.raw_status,
                last_event_at: latest.occurred_at,
                shipped_at: shipment.shipped_at ?? ((0, statuses_1.isShipped)(status) ? latest.occurred_at : null),
                delivered_at: shipment.delivered_at ?? (status === statuses_1.ShipmentStatus.DELIVERED ? latest.occurred_at : null),
                canceled_at: shipment.canceled_at ?? (status === statuses_1.ShipmentStatus.CANCELED ? latest.occurred_at : null),
            }
            : {}),
    });
    const { data: [fulfillment], } = await query.graph({
        entity: "fulfillment",
        filters: { id: shipment.fulfillment_id },
        fields: ["id", "shipped_at", "delivered_at", "canceled_at", "items.line_item_id", "items.quantity"],
    });
    const canTouchFulfillment = Boolean(fulfillment) && !fulfillment.canceled_at && Boolean(shipment.order_id) && !shipment.is_return;
    const result = {
        shipment_id: shipment.id,
        fulfillment_id: shipment.fulfillment_id,
        order_id: shipment.order_id ?? null,
        is_return: shipment.is_return,
        previous_status: previousStatus,
        status,
        changed: status !== previousStatus,
        new_events: fresh.length,
        waybill_number: shipment.waybill_number ?? null,
        tracking_url: shipment.tracking_url ?? null,
        mark_shipped: options.tracking.markShipped && canTouchFulfillment && (0, statuses_1.isShipped)(status) && !fulfillment?.shipped_at,
        mark_delivered: options.tracking.markDelivered &&
            canTouchFulfillment &&
            status === statuses_1.ShipmentStatus.DELIVERED &&
            !fulfillment?.delivered_at,
        shipment_items: (fulfillment?.items ?? [])
            .filter((item) => item.line_item_id)
            .map((item) => ({ id: item.line_item_id, quantity: Number(item.quantity) })),
    };
    return new workflows_sdk_1.StepResponse(result, {
        shipment_id: shipment.id,
        event_ids: fresh.map((event) => event.id),
        previous,
    });
}, async (compensation, { container }) => {
    if (!compensation) {
        return;
    }
    const apaczka = container.resolve(apaczka_1.APACZKA_MODULE);
    if (compensation.event_ids.length) {
        await apaczka.deleteApaczkaTrackingEvents(compensation.event_ids);
    }
    await apaczka.updateApaczkaShipments(compensation.previous);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwbHktdHJhY2tpbmctZXZlbnRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3dvcmtmbG93cy9zdGVwcy9hcHBseS10cmFja2luZy1ldmVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEscURBQWtGO0FBQ2xGLHFFQUE0RTtBQUU1RSx5REFBc0U7QUFDdEUsaURBQWdEO0FBQ2hELG1EQUFzRDtBQStCekMsUUFBQSx5QkFBeUIsR0FBRywrQkFBK0IsQ0FBQTtBQUV4RTs7Ozs7OztHQU9HO0FBQ1UsUUFBQSx1QkFBdUIsR0FBRyxJQUFBLDBCQUFVLEVBQy9DLGlDQUF5QixFQUN6QixLQUFLLEVBQUUsS0FBK0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7SUFDdkQsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBdUIsd0JBQWMsQ0FBQyxDQUFBO0lBQ3ZFLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsS0FBSyxDQUFDLENBQUE7SUFDaEUsTUFBTSxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUE7SUFFMUMsTUFBTSxRQUFRLEdBQUcsTUFBTSxPQUFPLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQTtJQUMzRixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDZCxNQUFNLElBQUksbUJBQVcsQ0FBQyxtQkFBVyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsb0JBQW9CLEtBQUssQ0FBQyxXQUFXLGdCQUFnQixDQUFDLENBQUE7SUFDM0csQ0FBQztJQUVELE1BQU0sS0FBSyxHQUFHLE1BQU0sT0FBTyxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFBO0lB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