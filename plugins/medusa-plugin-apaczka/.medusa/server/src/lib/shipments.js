"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentUrl = documentUrl;
exports.createShipment = createShipment;
exports.labelsFor = labelsFor;
const apaczka_1 = require("./apaczka");
const money_1 = require("./money");
const order_builder_1 = require("./order-builder");
const options_1 = require("./options");
const pickup_1 = require("./pickup");
/** Admin route that streams a document; used as the Medusa label URL. */
function documentUrl(apaczkaOrderId, type = "waybill") {
    return `/admin/apaczka/orders/${apaczkaOrderId}/documents/${type}`;
}
/**
 * Creates the Apaczka order for a fulfillment and describes the result in the
 * shape stored on `fulfillment.data` and `fulfillment.labels`.
 *
 * `order_send` is not idempotent, so it is called exactly once. Reading the
 * final price afterwards is best-effort: if it fails the shipment still
 * exists and the price can be synced later.
 */
async function createShipment(input) {
    const { client, build, logger } = input;
    const serviceId = build.overrides?.service_id ?? build.option.service_id;
    const sender = build.option.is_return ? build.customer : build.warehouse;
    const pickup = build.overrides?.pickup ??
        (await (0, pickup_1.resolvePickup)({
            client,
            option: build.option,
            serviceId,
            senderPostalCode: sender.postal_code,
            pickup: (0, options_1.optionsForService)(build.options, serviceId).pickup,
            logger,
        }));
    const payload = await (0, order_builder_1.buildOrderPayload)({ ...build, purpose: "shipment", pickup });
    const order = await client.sendOrder(payload);
    let priceNet;
    let priceGross;
    try {
        const details = await client.getOrder(order.id);
        priceNet = (0, money_1.decimalStringToGrosze)(details.price) ?? undefined;
        priceGross = (0, money_1.decimalStringToGrosze)(details.price_gross) ?? undefined;
    }
    catch (error) {
        logger?.warn(`[apaczka] Order ${order.id} created, but reading its price failed: ${error.message}`);
    }
    const state = {
        state: "created",
        status: order.status ? (0, apaczka_1.fromPollingStatus)(order.status) : apaczka_1.ShipmentStatus.CREATED,
        order_id: order.id,
        waybill_number: order.waybill_number,
        tracking_url: order.tracking_url,
        service_id: order.service_id ?? serviceId,
        service_name: order.service_name ?? build.option.service_name,
        supplier: order.supplier ?? build.option.supplier,
        is_return: build.option.is_return,
        cod: Boolean(payload.cod),
        point_id: payload.address.receiver.foreign_address_id,
        label_format: build.options.labelFormat,
        price_net: priceNet,
        price_gross: priceGross,
        cod_amount: payload.cod?.amount,
        declared_value: payload.shipment_value,
        created_at: new Date().toISOString(),
        sender_postal_code: payload.address.sender.postal_code,
    };
    return { state, labels: labelsFor(state), order, payload };
}
function labelsFor(state) {
    if (!state.order_id) {
        return [];
    }
    return [
        {
            tracking_number: state.waybill_number ?? String(state.order_id),
            tracking_url: state.tracking_url ?? "",
            label_url: documentUrl(state.order_id),
        },
    ];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hpcG1lbnRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2xpYi9zaGlwbWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFTQSxrQ0FFQztBQW1CRCx3Q0F1REM7QUFFRCw4QkFXQztBQWpHRCx1Q0FBNkQ7QUFFN0QsbUNBQStDO0FBQy9DLG1EQUF5RTtBQUN6RSx1Q0FBNkM7QUFDN0MscUNBQXdDO0FBRXhDLHlFQUF5RTtBQUN6RSxTQUFnQixXQUFXLENBQUMsY0FBK0IsRUFBRSxPQUFvQyxTQUFTO0lBQ3hHLE9BQU8seUJBQXlCLGNBQWMsY0FBYyxJQUFJLEVBQUUsQ0FBQTtBQUNwRSxDQUFDO0FBV0Q7Ozs7Ozs7R0FPRztBQUNJLEtBQUssVUFBVSxjQUFjLENBQUMsS0FJcEM7SUFDQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUE7SUFDdkMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLFNBQVMsRUFBRSxVQUFVLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUE7SUFFeEUsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUE7SUFDeEUsTUFBTSxNQUFNLEdBQ1YsS0FBSyxDQUFDLFNBQVMsRUFBRSxNQUFNO1FBQ3ZCLENBQUMsTUFBTSxJQUFBLHNCQUFhLEVBQUM7WUFDbkIsTUFBTTtZQUNOLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTTtZQUNwQixTQUFTO1lBQ1QsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLFdBQVc7WUFDcEMsTUFBTSxFQUFFLElBQUEsMkJBQWlCLEVBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQyxNQUFNO1lBQzFELE1BQU07U0FDUCxDQUFDLENBQUMsQ0FBQTtJ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