"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApaczkaEvents = void 0;
/**
 * Events emitted by the plugin. Subscribe to them to send your own
 * notifications or sync other systems:
 *
 * ```ts
 * export const config: SubscriberConfig = { event: ApaczkaEvents.DELIVERED }
 * ```
 *
 * Every payload includes `id` (the `apaczka_shipment` ID), `fulfillment_id`,
 * `order_id` and `status`.
 */
exports.ApaczkaEvents = {
    SHIPMENT_CREATED: "apaczka.shipment.created",
    STATUS_CHANGED: "apaczka.shipment.status_changed",
    SHIPPED: "apaczka.shipment.shipped",
    READY_FOR_PICKUP: "apaczka.shipment.ready_for_pickup",
    DELIVERED: "apaczka.shipment.delivered",
    EXCEPTION: "apaczka.shipment.exception",
    RETURNED: "apaczka.shipment.returned",
    CANCELED: "apaczka.shipment.canceled",
    PICKUP_BOOKED: "apaczka.pickup.booked",
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZlbnRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2xpYi9ldmVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7Ozs7Ozs7Ozs7R0FVRztBQUNVLFFBQUEsYUFBYSxHQUFHO0lBQzNCLGdCQUFnQixFQUFFLDBCQUEwQjtJQUM1QyxjQUFjLEVBQUUsaUNBQWlDO0lBQ2pELE9BQU8sRUFBRSwwQkFBMEI7SUFDbkMsZ0JBQWdCLEVBQUUsbUNBQW1DO0lBQ3JELFNBQVMsRUFBRSw0QkFBNEI7SUFDdkMsU0FBUyxFQUFFLDRCQUE0QjtJQUN2QyxRQUFRLEVBQUUsMkJBQTJCO0lBQ3JDLFFBQVEsRUFBRSwyQkFBMkI7SUFDckMsYUFBYSxFQUFFLHVCQUF1QjtDQUM5QixDQUFBIn0=