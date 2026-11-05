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
    const client = await apaczka.getClient();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9vay1waWNrdXAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvd29ya2Zsb3dzL3N0ZXBzL2Jvb2stcGlja3VwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLHFEQUFrRjtBQUNsRixxRUFBNEU7QUFFNUUseURBQW1GO0FBQ25GLG1EQUFzRDtBQVl6QyxRQUFBLGdCQUFnQixHQUFHLHFCQUFxQixDQUFBO0FBRXJEOzs7Ozs7O0dBT0c7QUFDVSxRQUFBLGNBQWMsR0FBRyxJQUFBLDBCQUFVLEVBQ3RDLHdCQUFnQixFQUNoQixLQUFLLEVBQUUsS0FBc0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7SUFDOUMsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBdUIsd0JBQWMsQ0FBQyxDQUFBO0lBQ3ZFLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQVMsaUNBQXlCLENBQUMsTUFBTSxDQUFDLENBQUE7SUFFMUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDL0IsTUFBTSxJQUFJLG1CQUFXLENBQUMsbUJBQVcsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLDhCQUE4QixDQUFDLENBQUE7SUFDdkYsQ0FBQztJQUVELE1BQU0sU0FBUyxHQUFHLE1BQU0sT0FBTyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFBO0lBQ2hGLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQTtJQUN0RixJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztR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