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
    const options = apaczka.getOptions();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwbHktdHJhY2tpbmctZXZlbnRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3dvcmtmbG93cy9zdGVwcy9hcHBseS10cmFja2luZy1ldmVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEscURBQWtGO0FBQ2xGLHFFQUE0RTtBQUU1RSx5REFBc0U7QUFDdEUsaURBQWdEO0FBQ2hELG1EQUFzRDtBQStCekMsUUFBQSx5QkFBeUIsR0FBRywrQkFBK0IsQ0FBQTtBQUV4RTs7Ozs7OztHQU9HO0FBQ1UsUUFBQSx1QkFBdUIsR0FBRyxJQUFBLDBCQUFVLEVBQy9DLGlDQUF5QixFQUN6QixLQUFLLEVBQUUsS0FBK0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7SUFDdkQsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBdUIsd0JBQWMsQ0FBQyxDQUFBO0lBQ3ZFLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsS0FBSyxDQUFDLENBQUE7SUFDaEUsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFBO0lBRXBDLE1BQU0sUUFBUSxHQUFHLE1BQU0sT0FBTyxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUE7SUFDM0YsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2QsTUFBTSxJQUFJLG1CQUFXLENBQUMsbUJBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLG9CQUFvQixLQUFLLENBQUMsV0FBVyxnQkFBZ0IsQ0FBQyxDQUFBO0lBQzNHLENBQUM7SUFFRCxNQUFNLEtBQUssR0FBRyxNQUFNLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUMzRSxN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