"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookPickupStep = exports.bookPickupStepId = void 0;
const utils_1 = require("@medusajs/framework/utils");
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const statuses_1 = require("../../lib/apaczka/statuses");
const apaczka_1 = require("../../modules/apaczka");
exports.bookPickupStepId = "apaczka-book-pickup";
/**
 * Orders a courier pickup: `pickup/{id}/` for one shipment, `batch_pickup/`
 * for several (same sender and service required by Apaczka).
 *
 * The Apaczka API cannot cancel a pickup, so a failure later in the workflow
 * only restores the local records; the booked pickup must be canceled in
 * the Apaczka panel.
 */
exports.bookPickupStep = (0, workflows_sdk_1.createStep)(exports.bookPickupStepId, async (input, { container }) => {
    const apaczka = container.resolve(apaczka_1.APACZKA_MODULE);
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    if (!input.shipment_ids.length) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Select at least one shipment");
    }
    const shipments = await apaczka.listApaczkaShipments({ id: input.shipment_ids });
    const missing = input.shipment_ids.filter((id) => !shipments.some((s) => s.id === id));
    if (missing.length) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_FOUND, `Shipments not found: ${missing.join(", ")}`);
    }
    const invalid = shipments.filter((s) => !s.apaczka_order_id || statuses_1.TERMINAL_STATUSES.has(s.status));
    if (invalid.length) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, `These shipments cannot get a pickup (not created in Apaczka, or already finished): ${invalid
            .map((s) => s.id)
            .join(", ")}`);
    }
    const window = { date: input.date, hour_from: input.hour_from, hour_to: input.hour_to };
    const client = apaczka.getClient();
    const result = shipments.length === 1
        ? await client.orderPickup(shipments[0].apaczka_order_id, window)
        : await client.batchPickup({ ...window, order_ids: shipments.map((s) => Number(s.apaczka_order_id)) });
    const pickupNumber = result?.foreign_courier_id ? String(result.foreign_courier_id) : null;
    logger.info(`[apaczka] Courier pickup booked for ${input.date} ${input.hour_from}-${input.hour_to}: ` +
        shipments.map((s) => s.apaczka_order_id).join(", "));
    const previous = shipments.map((s) => ({
        id: s.id,
        pickup_type: s.pickup_type,
        pickup_date: s.pickup_date,
        pickup_number: s.pickup_number,
    }));
    const updated = await apaczka.updateApaczkaShipments(shipments.map((s) => ({
        id: s.id,
        pickup_type: "COURIER",
        pickup_date: input.date,
        pickup_number: pickupNumber,
    })));
    return new workflows_sdk_1.StepResponse({ shipments: updated, pickup_number: pickupNumber }, previous);
}, async (previous, { container }) => {
    if (!previous?.length) {
        return;
    }
    const apaczka = container.resolve(apaczka_1.APACZKA_MODULE);
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    await apaczka.updateApaczkaShipments(previous);
    logger.warn("[apaczka] Pickup workflow rolled back; cancel the booked pickup in the Apaczka panel if needed");
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9vay1waWNrdXAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvd29ya2Zsb3dzL3N0ZXBzL2Jvb2stcGlja3VwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLHFEQUFrRjtBQUNsRixxRUFBNEU7QUFFNUUseURBQW1GO0FBQ25GLG1EQUFzRDtBQVl6QyxRQUFBLGdCQUFnQixHQUFHLHFCQUFxQixDQUFBO0FBRXJEOzs7Ozs7O0dBT0c7QUFDVSxRQUFBLGNBQWMsR0FBRyxJQUFBLDBCQUFVLEVBQ3RDLHdCQUFnQixFQUNoQixLQUFLLEVBQUUsS0FBc0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7SUFDOUMsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBdUIsd0JBQWMsQ0FBQyxDQUFBO0lBQ3ZFLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQVMsaUNBQXlCLENBQUMsTUFBTSxDQUFDLENBQUE7SUFFMUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDL0IsTUFBTSxJQUFJLG1CQUFXLENBQUMsbUJBQVcsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLDhCQUE4QixDQUFDLENBQUE7SUFDdkYsQ0FBQztJQUVELE1BQU0sU0FBUyxHQUFHLE1BQU0sT0FBTyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFBO0lBQ2hGLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQTtJQUN0RixJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNuQixNQUFNLElBQUksbUJBQVcsQ0FBQyxtQkFBVyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsd0JBQXdCLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFBO0lBQ2xHLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUMsTUFBTSxDQUM5QixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLElBQUksNEJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUF3QixDQUFDLENBQ2hGLENBQUE7SUFDRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNuQixNQUFNLElBQUksbUJBQVcsQ0FDbkIsbUJBQVcsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUM3QixzRkFBc0YsT0FBTzthQUMxRixHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7YUFDaEIsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQ2hCLENBQUE7SUFDSCxDQUFDO0lBRUQsTUFBTSxNQUFNLEdBQUcsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLFNBQVMsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFBO0lBQ3ZGLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQTtJQUNsQyxNQUFNLE1BQU0sR0FDVixTQUFTLENBQUMsTUFBTSxLQUFLLENBQUM7UUFDcEIsQ0FBQyxDQUFDLE1BQU0sTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0JBQWlCLEVBQUUsTUFBTSxDQUFDO1FBQ2xFLENBQUMsQ0FBQyxNQUFNLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxHQUFHLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0lBRTFHLE1BQU0sWUFBWSxHQUFHLE1BQU0sRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUE7SUFDMUYsTUFBTSxDQUFDLElBQUksQ0FDVCx1Q0FBdUMsS0FBSyxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsU0FBUyxJQUFJLEtBQUssQ0FBQyxPQUFPLElBQUk7UUFDdkYsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUN0RCxDQUFBO0lBRUQsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNyQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUU7UUFDUixXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVc7UUFDMUIsV0FBVyxFQUFFLENBQUMsQ0FBQyxXQUFXO1FBQzFCLGFBQWEsRUFBRSxDQUFDLENBQUMsYUFBYTtLQUMvQixDQUFDLENBQUMsQ0FBQTtJQUVILE1BQU0sT0FBTyxHQUFHLE1BQU0sT0FBTyxDQUFDLHNCQUFzQixDQUNsRCxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BCLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRTtRQUNSLFdBQVcsRUFBRSxTQUFTO1FBQ3RCLFdBQVcsRUFBRSxLQUFLLENBQUMsSUFBSTtRQUN2QixhQUFhLEVBQUUsWUFBWTtLQUM1QixDQUFDLENBQUMsQ0FDSixDQUFBO0lBRUQsT0FBTyxJQUFJLDRCQUFZLENBQUMsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxZQUFZLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQTtBQUN4RixDQUFDLEVBQ0QsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7SUFDaEMsSUFBSSxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUN0QixPQUFNO0lBQ1IsQ0FBQztJQUNELE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQXVCLHdCQUFjLENBQUMsQ0FBQTtJQUN2RSxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFTLGlDQUF5QixDQUFDLE1BQU0sQ0FBQyxDQUFBO0lBQzFFLE1BQU0sT0FBTyxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxDQUFBO0lBQzlDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0dBQWdHLENBQUMsQ0FBQTtBQUMvRyxDQUFDLENBQ0YsQ0FBQSJ9