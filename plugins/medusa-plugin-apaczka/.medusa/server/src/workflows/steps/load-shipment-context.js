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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9hZC1zaGlwbWVudC1jb250ZXh0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL3dvcmtmbG93cy9zdGVwcy9sb2FkLXNoaXBtZW50LWNvbnRleHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBOENBLGtEQTBIQztBQXZLRCxxREFBa0Y7QUFDbEYscUVBQTRFO0FBRzVFLHlDQUFpRjtBQUNqRix1RUFBcUc7QUErQnJHLE1BQU0sVUFBVSxHQUFHLGdCQUFnQixDQUFBO0FBRXRCLFFBQUEseUJBQXlCLEdBQUcsK0JBQStCLENBQUE7QUFFeEU7Ozs7R0FJRztBQUNJLEtBQUssVUFBVSxtQkFBbUIsQ0FBQyxTQUEwQixFQUFFLGFBQXFCO0lBQ3pGLE1BQU0sS0FBSyxHQUFHLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxDQUFBO0lBQy9DLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsS0FBSyxDQUFDLENBQUE7SUFFaEUsTUFBTSxFQUNKLElBQUksRUFBRSxDQUFDLFdBQVcsQ0FBQyxHQUNwQixHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQztRQUNwQixNQUFNLEVBQUUsYUFBYTtRQUNyQixPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRTtRQUNyQyxNQUFNLEVBQUU7WUFDTixJQUFJO1lBQ0osYUFBYTtZQUNiLGFBQWE7WUFDYixNQUFNO1lBQ04sYUFBYTtZQUNiLFlBQVk7WUFDWixvQkFBb0I7WUFDcEIsb0JBQW9CO1lBQ3BCLGFBQWE7WUFDYixnQkFBZ0I7WUFDaEIsc0JBQXNCO1lBQ3RCLFVBQVU7WUFDVixXQUFXO1lBQ1gsaUJBQWlCO1NBQ2xCO0tBQ0YsQ0FBQyxDQUFBO0lBRUYsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ2pCLE1BQU0sSUFBSSxtQkFBVyxDQUFDLG1CQUFXLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxlQUFlLEtBQUssQ0FBQyxjQUFjLGdCQUFnQixDQUFDLENBQUE7SUFDekcsQ0FBQztJQUVELE1BQU0sSUFBSSxHQUFHLElBQUEsMEJBQW1CLEVBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQ2xELE1BQU0sWUFBWSxHQUFJLFdBQW9FLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQTtJQUN6RyxNQUFNLE9BQU8sR0FBSSxXQUFpRCxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksWUFBWSxFQUFFLFFBQVEsSUFBSSxJQUFJLENBQUE7SUFFOUcsTUFBTSxVQUFVLEdBQUcsSUFBQSw0Q0FBc0IsRUFDdEMsV0FBd0QsQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUNoRixDQUFBO0lBQ0QsTUFBTSxRQUFRLEdBQUcsSUFBQSw0Q0FBc0IsRUFBRSxJQUFnQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUE7SUFDdEYsTUFBTSxVQUFVLEdBQUcsUUFBUSxJQUFJLFVBQVUsQ0FBQTtJQUN6QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDaEIsTUFBTSxJQUFJLG1CQUFXLENBQ25CLG1CQUFXLENBQUMsS0FBSyxDQUFDLFlBQVksRUFDOUIsZUFBZSxLQUFLLENBQUMsY0FBYywwQ0FBMEMsQ0FDOUUsQ0FBQTtJQUNILENBQUM7SUFDRCxNQUFNLE1BQU0sR0FBRyxFQUFFLEdBQUcsVUFBVSxFQUFFLFNBQVMsRUFBRSxVQUFVLENBQUMsU0FBUyxJQUFJLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFBO0lBRTFGLE1BQU0sQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDO1FBQzFDLFdBQVcsQ0FBQyxXQUFXO1lBQ3JCLENBQUMsQ0FBQyxLQUFLO2lCQUNGLEtBQUssQ0FBQztnQkFDTCxNQUFNLEVBQUUsZ0JBQWdCO2dCQUN4QixPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsV0FBVyxDQUFDLFdBQVcsRUFBRTtnQkFDeEMsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxXQUFXLENBQUM7YUFDcEMsQ0FBQztpQkFDRCxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBRSxJQUFJLENBQUMsQ0FBQyxDQUFtQyxJQUFJLElBQUksQ0FBQztZQUMzRSxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7UUFDekIsT0FBTztZQUNMLENBQUMsQ0FBQyxLQUFLO2lCQUNGLEtBQUssQ0FBQztnQkFDTCxNQUFNLEVBQUUsT0FBTztnQkFDZixPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFO2dCQUN4QixNQUFNLEVBQUU7b0JBQ04sSUFBSTtvQkFDSixZQUFZO29CQUNaLE9BQU87b0JBQ1AsT0FBTztvQkFDUCxvQkFBb0I7b0JBQ3BCLFVBQVU7b0JBQ1YsYUFBYTtvQkFDYixrQkFBa0I7b0JBQ2xCLHNCQUFzQjtvQkFDdEIsc0JBQXNCO29CQUN0QixxQkFBcUI7b0JBQ3JCLHNCQUFzQjtpQkFDdkI7YUFDRixDQUFDO2lCQUNELElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUM7WUFDeEMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO0tBQzFCLENBQUMsQ0FBQTtJQUVGLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUN2QixDQUFDLEtBQUssRUFBRSxLQUFLLElBQUksRUFBRSxDQUEyQztTQUM1RCxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQW1DLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDaEUsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFZLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FDNUMsQ0FBQTtJQUVELE1BQU0sS0FBSyxHQUEyQixDQUFDLFdBQVcsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFvQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFO1FBQzlHLE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQXNCLENBQUMsQ0FBQTtRQUM3RCxPQUFPO1lBQ0wsWUFBWSxFQUFHLElBQUksQ0FBQyxZQUF1QixJQUFJLElBQUk7WUFDbkQsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLFNBQVMsRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ25ELFFBQVEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUM7WUFDcEMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsVUFBVSxJQUFJLENBQUMsQ0FBQztZQUM5QyxPQUFPLEVBQUcsU0FBUyxFQUFFLE9BQTBDLElBQUksSUFBSTtTQUN4RSxDQUFBO0lBQ0gsQ0FBQyxDQUFDLENBQUE7SUFFRixNQUFNLGVBQWUsR0FBSSxLQUFLLEVBQUUsZ0JBQXlELElBQUksSUFBSSxDQUFBO0lBQ2pHLE1BQU0sZUFBZSxHQUFJLFdBQVcsQ0FBQyxnQkFBNkMsSUFBSSxJQUFJLENBQUE7SUFFMUYsTUFBTSxPQUFPLEdBQW9CO1FBQy9CLGNBQWMsRUFBRSxXQUFXLENBQUMsRUFBRTtRQUM5QixXQUFXLEVBQUUsV0FBVyxDQUFDLFdBQVcsSUFBSSxJQUFJO1FBQzVDLFdBQVcsRUFBRSxXQUFXLENBQUMsV0FBVyxJQUFJLElBQUk7UUFDNUMsSUFBSTtRQUNKLE1BQU07UUFDTixRQUFRO1FBQ1IsZ0JBQWdCLEVBQUUsZUFBZTtRQUNqQyxnQkFBZ0IsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxJQUFJLGVBQWUsQ0FBQztRQUMzRixLQUFLLEVBQUcsS0FBSyxFQUFFLEtBQW1DLElBQUksSUFBSTtRQUMxRCxRQUFRLEVBQUUsT0FBTztRQUNqQixVQUFVLEVBQUcsS0FBSyxFQUFFLFVBQXdDLElBQUksSUFBSTtRQUNwRSxXQUFXLEVBQUUsTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLElBQUksQ0FBQyxDQUFDO1FBQ3RDLFNBQVMsRUFBRSxZQUFZLEVBQUUsRUFBRSxJQUFJLElBQUk7UUFDbkMsS0FBSztRQUNMLFFBQVEsRUFBRSxPQUFPLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQztRQUMxQyxPQUFPLEVBQUUsT0FBTyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUM7S0FDekMsQ0FBQTtJQUVELE9BQU8sT0FBTyxDQUFBO0FBQ2hCLENBQUM7QUFFWSxRQUFBLHVCQUF1QixHQUFHLElBQUEsMEJBQVUsRUFDL0MsaUNBQXlCLEVBQ3pCLEtBQUssRUFBRSxLQUFpQyxFQUFFLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUN6RCxJQUFJLDRCQUFZLENBQUMsTUFBTSxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQy9FLENBQUEifQ==