"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TERMINAL_STATUSES = exports.ShipmentStatus = void 0;
exports.fromPollingStatus = fromPollingStatus;
exports.fromWebhookStatus = fromWebhookStatus;
exports.isShipped = isShipped;
/**
 * One status vocabulary for the whole plugin.
 *
 * Apaczka uses two different sets: one for polling (`tracking/`) and a richer
 * one for push webhooks. They must not share a mapping (the docs warn about
 * this; e.g. `CANCELED` vs `CANCELLED`, and webhook `SENT` means a COD payout,
 * not "sent"). Both are mapped here onto `ShipmentStatus`.
 */
exports.ShipmentStatus = {
    /** Created in Medusa, not yet sent to Apaczka. */
    PENDING: "pending",
    /** Order exists in Apaczka; parcel not with the carrier yet. */
    CREATED: "created",
    /** Handed over to the carrier. */
    POSTED: "posted",
    IN_TRANSIT: "in_transit",
    OUT_FOR_DELIVERY: "out_for_delivery",
    /** Waiting in a parcel locker / pickup point. */
    READY_FOR_PICKUP: "ready_for_pickup",
    DELIVERED: "delivered",
    /** Needs attention: failed delivery attempt, notice left, unknown status. */
    EXCEPTION: "exception",
    RETURNED: "returned",
    CANCELED: "canceled",
    /** Complaint / correction case opened. */
    CLAIMED: "claimed",
    UNKNOWN: "unknown",
};
const POLLING_MAP = {
    NEW: exports.ShipmentStatus.CREATED,
    PICKUP: exports.ShipmentStatus.POSTED,
    IN_TRANSIT: exports.ShipmentStatus.IN_TRANSIT,
    DELIVERED: exports.ShipmentStatus.DELIVERED,
    DELIVERED_NO_SYSTEM: exports.ShipmentStatus.DELIVERED,
    EXCEPTION: exports.ShipmentStatus.EXCEPTION,
    RETURNED_TO_SHIPPER: exports.ShipmentStatus.RETURNED,
    CANCELLED: exports.ShipmentStatus.CANCELED,
    CORRECTION: exports.ShipmentStatus.CLAIMED,
    UNKNOWN: exports.ShipmentStatus.UNKNOWN,
};
const WEBHOOK_MAP = {
    NEW: exports.ShipmentStatus.CREATED,
    READY_TO_SEND: exports.ShipmentStatus.CREATED,
    ADVISING: exports.ShipmentStatus.CREATED,
    POSTED: exports.ShipmentStatus.POSTED,
    ON_THE_WAY: exports.ShipmentStatus.IN_TRANSIT,
    OUT_FOR_DELIVERY: exports.ShipmentStatus.OUT_FOR_DELIVERY,
    READY_TO_PICKUP: exports.ShipmentStatus.READY_FOR_PICKUP,
    DELIVERED: exports.ShipmentStatus.DELIVERED,
    WAITING_FOR_PAYOUT: exports.ShipmentStatus.DELIVERED,
    SENT: exports.ShipmentStatus.DELIVERED,
    AVIZO: exports.ShipmentStatus.EXCEPTION,
    REMINDER_SENT: exports.ShipmentStatus.EXCEPTION,
    OTHER: exports.ShipmentStatus.EXCEPTION,
    UNKNOWN: exports.ShipmentStatus.UNKNOWN,
    PICKUP_EXPIRED: exports.ShipmentStatus.RETURNED,
    RETURNED: exports.ShipmentStatus.RETURNED,
    CANCELED: exports.ShipmentStatus.CANCELED,
    CLAIMED: exports.ShipmentStatus.CLAIMED,
};
function fromPollingStatus(status) {
    return POLLING_MAP[status] ?? exports.ShipmentStatus.UNKNOWN;
}
function fromWebhookStatus(status) {
    return WEBHOOK_MAP[status] ?? exports.ShipmentStatus.UNKNOWN;
}
/** Statuses after which nothing else is expected to happen. */
exports.TERMINAL_STATUSES = new Set([
    exports.ShipmentStatus.DELIVERED,
    exports.ShipmentStatus.RETURNED,
    exports.ShipmentStatus.CANCELED,
]);
/** True once the parcel is physically with the carrier. */
function isShipped(status) {
    return (status === exports.ShipmentStatus.POSTED ||
        status === exports.ShipmentStatus.IN_TRANSIT ||
        status === exports.ShipmentStatus.OUT_FOR_DELIVERY ||
        status === exports.ShipmentStatus.READY_FOR_PICKUP ||
        status === exports.ShipmentStatus.DELIVERED ||
        status === exports.ShipmentStatus.EXCEPTION ||
        status === exports.ShipmentStatus.RETURNED);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHVzZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvbGliL2FwYWN6a2Evc3RhdHVzZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBbUVBLDhDQUVDO0FBRUQsOENBRUM7QUFVRCw4QkFVQztBQTNGRDs7Ozs7OztHQU9HO0FBQ1UsUUFBQSxjQUFjLEdBQUc7SUFDNUIsa0RBQWtEO0lBQ2xELE9BQU8sRUFBRSxTQUFTO0lBQ2xCLGdFQUFnRTtJQUNoRSxPQUFPLEVBQUUsU0FBUztJQUNsQixrQ0FBa0M7SUFDbEMsTUFBTSxFQUFFLFFBQVE7SUFDaEIsVUFBVSxFQUFFLFlBQVk7SUFDeEIsZ0JBQWdCLEVBQUUsa0JBQWtCO0lBQ3BDLGlEQUFpRDtJQUNqRCxnQkFBZ0IsRUFBRSxrQkFBa0I7SUFDcEMsU0FBUyxFQUFFLFdBQVc7SUFDdEIsNkVBQTZFO0lBQzdFLFNBQVMsRUFBRSxXQUFXO0lBQ3RCLFFBQVEsRUFBRSxVQUFVO0lBQ3BCLFFBQVEsRUFBRSxVQUFVO0lBQ3BCLDBDQUEwQztJQUMxQyxPQUFPLEVBQUUsU0FBUztJQUNsQixPQUFPLEVBQUUsU0FBUztDQUNWLENBQUE7QUFJVixNQUFNLFdBQVcsR0FBaUQ7SUFDaEUsR0FBRyxFQUFFLHNCQUFjLENBQUMsT0FBTztJQUMzQixNQUFNLEVBQUUsc0JBQWMsQ0FBQyxNQUFNO0lBQzdCLFVBQVUsRUFBRSxzQkFBYyxDQUFDLFVBQVU7SUFDckMsU0FBUyxFQUFFLHNCQUFjLENBQUMsU0FBUztJQUNuQyxtQkFBbUIsRUFBRSxzQkFBYyxDQUFDLFNBQVM7SUFDN0MsU0FBUyxFQUFFLHNCQUFjLENBQUMsU0FBUztJQUNuQyxtQkFBbUIsRUFBRSxzQkFBYyxDQUFDLFFBQVE7SUFDNUMsU0FBUyxFQUFFLHNCQUFjLENBQUMsUUFBUTtJQUNsQyxVQUFVLEVBQUUsc0JBQWMsQ0FBQyxPQUFPO0lBQ2xDLE9BQU8sRUFBRSxzQkFBYyxDQUFDLE9BQU87Q0FDaEMsQ0FBQTtBQUVELE1BQU0sV0FBVyxHQUFpRDtJQUNoRSxHQUFHLEVBQUUsc0JBQWMsQ0FBQyxPQUFPO0lBQzNCLGFBQWEsRUFBRSxzQkFBYyxDQUFDLE9BQU87SUFDckMsUUFBUSxFQUFFLHNCQUFjLENBQUMsT0FBTztJQUNoQyxNQUFNLEVBQUUsc0JBQWMsQ0FBQyxNQUFNO0lBQzdCLFVBQVUsRUFBRSxzQkFBYyxDQUFDLFVBQVU7SUFDckMsZ0JBQWdCLEVBQUUsc0JBQWMsQ0FBQyxnQkFBZ0I7SUFDakQsZUFBZSxFQUFFLHNCQUFjLENBQUMsZ0JBQWdCO0lBQ2hELFNBQVMsRUFBRSxzQkFBYyxDQUFDLFNBQVM7SUFDbkMsa0JBQWtCLEVBQUUsc0JBQWMsQ0FBQyxTQUFTO0lBQzVDLElBQUksRUFBRSxzQkFBYyxDQUFDLFNBQVM7SUFDOUIsS0FBSyxFQUFFLHNCQUFjLENBQUMsU0FBUztJQUMvQixhQUFhLEVBQUUsc0JBQWMsQ0FBQyxTQUFTO0lBQ3ZDLEtBQUssRUFBRSxzQkFBYyxDQUFDLFNBQVM7SUFDL0IsT0FBTyxFQUFFLHNCQUFjLENBQUMsT0FBTztJQUMvQixjQUFjLEVBQUUsc0JBQWMsQ0FBQyxRQUFRO0lBQ3ZDLFFBQVEsRUFBRSxzQkFBYyxDQUFDLFFBQVE7SUFDakMsUUFBUSxFQUFFLHNCQUFjLENBQUMsUUFBUTtJQUNqQyxPQUFPLEVBQUUsc0JBQWMsQ0FBQyxPQUFPO0NBQ2hDLENBQUE7QUFFRCxTQUFnQixpQkFBaUIsQ0FBQyxNQUFjO0lBQzlDLE9BQU8sV0FBVyxDQUFDLE1BQThCLENBQUMsSUFBSSxzQkFBYyxDQUFDLE9BQU8sQ0FBQTtBQUM5RSxDQUFDO0FBRUQsU0FBZ0IsaUJBQWlCLENBQUMsTUFBYztJQUM5QyxPQUFPLFdBQVcsQ0FBQyxNQUE4QixDQUFDLElBQUksc0JBQWMsQ0FBQyxPQUFPLENBQUE7QUFDOUUsQ0FBQztBQUVELCtEQUErRDtBQUNsRCxRQUFBLGlCQUFpQixHQUFnQyxJQUFJLEdBQUcsQ0FBQztJQUNwRSxzQkFBYyxDQUFDLFNBQVM7SUFDeEIsc0JBQWMsQ0FBQyxRQUFRO0lBQ3ZCLHNCQUFjLENBQUMsUUFBUTtDQUN4QixDQUFDLENBQUE7QUFFRiwyREFBMkQ7QUFDM0QsU0FBZ0IsU0FBUyxDQUFDLE1BQXNCO0lBQzlDLE9BQU8sQ0FDTCxNQUFNLEtBQUssc0JBQWMsQ0FBQyxNQUFNO1FBQ2hDLE1BQU0sS0FBSyxzQkFBYyxDQUFDLFVBQVU7UUFDcEMsTUFBTSxLQUFLLHNCQUFjLENBQUMsZ0JBQWdCO1FBQzFDLE1BQU0sS0FBSyxzQkFBYyxDQUFDLGdCQUFnQjtRQUMxQyxNQUFNLEtBQUssc0JBQWMsQ0FBQyxTQUFTO1FBQ25DLE1BQU0sS0FBSyxzQkFBYyxDQUFDLFNBQVM7UUFDbkMsTUFBTSxLQUFLLHNCQUFjLENBQUMsUUFBUSxDQUNuQyxDQUFBO0FBQ0gsQ0FBQyJ9