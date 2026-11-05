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
        return new workflows_sdk_1.StepResponse(updated, { created: false, previous: existing });
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBzZXJ0LXNoaXBtZW50LXJlY29yZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy93b3JrZmxvd3Mvc3RlcHMvdXBzZXJ0LXNoaXBtZW50LXJlY29yZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFvREEsNEJBMEJDO0FBN0VELHFFQUE0RTtBQUc1RSxtREFBc0Q7QUFlekMsUUFBQSwwQkFBMEIsR0FBRyxnQ0FBZ0MsQ0FBQTtBQUUxRSx1RUFBdUU7QUFDMUQsUUFBQSx3QkFBd0IsR0FBRyxJQUFBLDBCQUFVLEVBQ2hELGtDQUEwQixFQUMxQixLQUFLLEVBQUUsS0FBZ0MsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7SUFDeEQsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBdUIsd0JBQWMsQ0FBQyxDQUFBO0lBQ3ZFLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUU5QixNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsb0JBQW9CLENBQUMsRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUE7SUFDL0YsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUNiLE1BQU0sT0FBTyxHQUFHLENBQUMsTUFBTSxPQUFPLENBQUMsc0JBQXNCLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxDQUFDLEVBQUUsRUFBRSxHQUFHLE1BQU0sRUFBRSxDQUFDLENBQW1CLENBQUE7UUFDeEcsT0FBTyxJQUFJLDRCQUFZLENBQStCLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFFBQXFDLEVBQUUsQ0FBQyxDQUFBO0lBQ3JJLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxDQUFDLE1BQU0sT0FBTyxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxDQUFtQixDQUFBO0lBQ2hGLE9BQU8sSUFBSSw0QkFB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