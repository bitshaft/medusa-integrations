"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertShipmentRecordStep = exports.upsertShipmentRecordStepId = void 0;
exports.toRecord = toRecord;
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const apaczka_1 = require("../../modules/apaczka");
exports.upsertShipmentRecordStepId = "apaczka-upsert-shipment-record";
/** Creates or updates the `apaczka_shipment` row for a fulfillment. */
exports.upsertShipmentRecordStep = (0, workflows_sdk_1.createStep)(exports.upsertShipmentRecordStepId, async (input, { container }) => {
    const apaczka = container.resolve(apaczka_1.APACZKA_MODULE);
    const values = toRecord(input);
    const [existing] = await apaczka.listApaczkaShipments({ fulfillment_id: input.fulfillment_id });
    if (existing) {
        const updated = (await apaczka.updateApaczkaShipments({ id: existing.id, ...values }));
        return new workflows_sdk_1.StepResponse(updated, {
            created: false,
            previous: existing,
        });
    }
    const created = (await apaczka.createApaczkaShipments(values));
    return new workflows_sdk_1.StepResponse(created, { created: true, id: created.id });
}, async (compensation, { container }) => {
    if (!compensation) {
        return;
    }
    const apaczka = container.resolve(apaczka_1.APACZKA_MODULE);
    if (compensation.created) {
        await apaczka.deleteApaczkaShipments(compensation.id);
        return;
    }
    const { events, created_at, updated_at, deleted_at, ...previous } = compensation.previous;
    await apaczka.updateApaczkaShipments(previous);
});
function toRecord(input) {
    const { state } = input;
    return {
        fulfillment_id: input.fulfillment_id,
        order_id: input.order_id ?? null,
        return_id: input.return_id ?? null,
        apaczka_order_id: state.order_id ? String(state.order_id) : null,
        waybill_number: state.waybill_number ?? null,
        tracking_url: state.tracking_url ?? null,
        service_id: state.service_id,
        service_name: state.service_name ?? null,
        supplier: state.supplier ?? null,
        status: state.status ?? (state.state === "pending" ? "pending" : "created"),
        is_return: state.is_return,
        is_cod: state.cod,
        point_id: state.point_id ?? null,
        label_format: state.label_format,
        price_net: state.price_net ?? null,
        price_gross: state.price_gross ?? null,
        cod_amount: state.cod_amount ?? null,
        declared_value: state.declared_value ?? null,
        pickup_type: input.pickup?.type ?? null,
        pickup_date: input.pickup?.date ?? null,
        error: state.error ?? null,
        metadata: state.sender_postal_code ? { sender_postal_code: state.sender_postal_code } : null,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBzZXJ0LXNoaXBtZW50LXJlY29yZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy93b3JrZmxvd3Mvc3RlcHMvdXBzZXJ0LXNoaXBtZW50LXJlY29yZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUF5REEsNEJBMEJDO0FBbEZELHFFQUE0RTtBQUc1RSxtREFBc0Q7QUFlekMsUUFBQSwwQkFBMEIsR0FBRyxnQ0FBZ0MsQ0FBQTtBQUUxRSx1RUFBdUU7QUFDMUQsUUFBQSx3QkFBd0IsR0FBRyxJQUFBLDBCQUFVLEVBQ2hELGtDQUEwQixFQUMxQixLQUFLLEVBQUUsS0FBZ0MsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7SUFDeEQsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBdUIsd0JBQWMsQ0FBQyxDQUFBO0lBQ3ZFLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUU5QixNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsb0JBQW9CLENBQUMsRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUE7SUFDL0YsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUNiLE1BQU0sT0FBTyxHQUFHLENBQUMsTUFBTSxPQUFPLENBQUMsc0JBQXNCLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxDQUFDLEVBQUUsRUFBRSxHQUFHLE1BQU0sRUFBRSxDQUFDLENBQW1CLENBQUE7UUFDeEcsT0FBTyxJQUFJLDRCQUFZLENBQStCLE9BQU8sRUFBRTtZQUM3RCxPQUFPLEVBQUUsS0FBSztZQUNkLFFBQVEsRUFBRSxRQUFxQztTQUNoRCxDQUFDLENBQUE7SUFDSixDQUFDO0lBRUQsTUFBTSxPQUFPLEdBQUcsQ0FBQyxNQUFNLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsQ0FBbUIsQ0FBQTtJQUNoRixPQUFPLElBQUksNEJB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