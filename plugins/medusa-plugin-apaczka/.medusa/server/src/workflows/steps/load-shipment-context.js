"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadShipmentContextStep = exports.loadShipmentContextStepId = void 0;
exports.loadShipmentContext = loadShipmentContext;
const utils_1 = require("@medusajs/framework/utils");
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const data_1 = require("../../lib/data");
const fulfillment_options_1 = require("../../lib/fulfillment-options");
const OPTION_KEY = "apaczka_option";
exports.loadShipmentContextStepId = "apaczka-load-shipment-context";
/**
 * Gathers everything needed to create an Apaczka order for an existing
 * fulfillment: the service, the warehouse (with its full address), the
 * customer, the items and the order total.
 */
async function loadShipmentContext(container, fulfillmentId) {
    const input = { fulfillment_id: fulfillmentId };
    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const { data: [fulfillment], } = await query.graph({
        entity: "fulfillment",
        filters: { id: input.fulfillment_id },
        fields: [
            "id",
            "provider_id",
            "location_id",
            "data",
            "canceled_at",
            "shipped_at",
            "delivery_address.*",
            "items.line_item_id",
            "items.title",
            "items.quantity",
            "shipping_option.data",
            "order.id",
            "return.id",
            "return.order_id",
        ],
    });
    if (!fulfillment) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_FOUND, `Fulfillment ${input.fulfillment_id} was not found`);
    }
    const data = (0, data_1.readFulfillmentData)(fulfillment.data);
    const returnRecord = fulfillment.return ?? null;
    const orderId = fulfillment.order?.id ?? returnRecord?.order_id ?? null;
    const fromOption = (0, fulfillment_options_1.parseFulfillmentOption)(fulfillment.shipping_option?.data);
    const fromData = (0, fulfillment_options_1.parseFulfillmentOption)(data[OPTION_KEY]);
    const baseOption = fromData ?? fromOption;
    if (!baseOption) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Fulfillment ${input.fulfillment_id} does not use an Apaczka shipping option`);
    }
    const option = { ...baseOption, is_return: baseOption.is_return || Boolean(returnRecord) };
    const [location, order] = await Promise.all([
        fulfillment.location_id
            ? query
                .graph({
                entity: "stock_location",
                filters: { id: fulfillment.location_id },
                fields: ["id", "name", "address.*"],
            })
                .then(({ data }) => data[0] ?? null)
            : Promise.resolve(null),
        orderId
            ? query
                .graph({
                entity: "order",
                filters: { id: orderId },
                fields: [
                    "id",
                    "display_id",
                    "email",
                    "total",
                    "shipping_address.*",
                    "items.id",
                    "items.title",
                    "items.unit_price",
                    "items.variant.weight",
                    "items.variant.length",
                    "items.variant.width",
                    "items.variant.height",
                ],
            })
                .then(({ data }) => data[0] ?? null)
            : Promise.resolve(null),
    ]);
    const orderItems = new Map((order?.items ?? [])
        .filter((item) => Boolean(item))
        .map((item) => [item.id, item]));
    const items = (fulfillment.items ?? []).map((item) => {
        const orderItem = orderItems.get(item.line_item_id);
        return {
            line_item_id: item.line_item_id ?? null,
            title: String(item.title ?? orderItem?.title ?? ""),
            quantity: Number(item.quantity ?? 1),
            unit_price: Number(orderItem?.unit_price ?? 0),
            variant: orderItem?.variant ?? null,
        };
    });
    const shippingAddress = order?.shipping_address ?? null;
    const deliveryAddress = fulfillment.delivery_address ?? null;
    const context = {
        fulfillment_id: fulfillment.id,
        provider_id: fulfillment.provider_id ?? null,
        location_id: fulfillment.location_id ?? null,
        data,
        option,
        location,
        delivery_address: deliveryAddress,
        customer_address: option.is_return ? shippingAddress : (deliveryAddress ?? shippingAddress),
        email: order?.email ?? null,
        order_id: orderId,
        display_id: order?.display_id ?? null,
        order_total: Number(order?.total ?? 0),
        return_id: returnRecord?.id ?? null,
        items,
        canceled: Boolean(fulfillment.canceled_at),
        shipped: Boolean(fulfillment.shipped_at),
    };
    return context;
}
exports.loadShipmentContextStep = (0, workflows_sdk_1.createStep)(exports.loadShipmentContextStepId, async (input, { container }) => new workflows_sdk_1.StepResponse(await loadShipmentContext(container, input.fulfillment_id)));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9hZC1zaGlwbWVudC1jb250ZXh0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3dvcmtmbG93cy9zdGVwcy9sb2FkLXNoaXBtZW50LWNvbnRleHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBOENBLGtEQTJIQztBQXhLRCxxREFBa0Y7QUFDbEYscUVBQTRFO0FBRzVFLHlDQUFpRjtBQUNqRix1RUFBcUc7QUErQnJHLE1BQU0sVUFBVSxHQUFHLGdCQUFnQixDQUFBO0FBRXRCLFFBQUEseUJBQXlCLEdBQUcsK0JBQStCLENBQUE7QUFFeEU7Ozs7R0FJRztBQUNJLEtBQUssVUFBVSxtQkFBbUIsQ0FDdkMsU0FBMEIsRUFDMUIsYUFBcUI7SUFFckIsTUFBTSxLQUFLLEdBQUcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLENBQUE7SUFDL0MsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxpQ0FBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUVoRSxNQUFNLEVBQ0osSUFBSSxFQUFFLENBQUMsV0FBVyxDQUFDLEdBQ3BCLEdBQUcsTUFBTSxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQ3BCLE1BQU0sRUFBRSxhQUFhO1FBQ3JCLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsY0FBYyxFQUFFO1FBQ3JDLE1BQU0sRUFBRTtZQUNOLElBQUk7WUFDSixhQUFhO1lBQ2IsYUFBYTtZQUNiLE1BQU07WUFDTixhQUFhO1lBQ2IsWUFBWTtZQUNaLG9CQUFvQjtZQUNwQixvQkFBb0I7WUFDcEIsYUFBYTtZQUNiLGdCQUFnQjtZQUNoQixzQkFBc0I7WUFDdEIsVUFBVTtZQUNWLFdBQVc7WUFDWCxpQkFBaUI7U0FDbEI7S0FDRixDQUFDLENBQUE7SUFFRixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDakIsTUFBTSxJQUFJLG1CQUFXLENBQUMsbUJBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxF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