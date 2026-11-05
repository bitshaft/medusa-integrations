"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
const addresses_1 = require("../../../../../../lib/addresses");
const order_builder_1 = require("../../../../../../lib/order-builder");
const parcels_1 = require("../../../../../../lib/parcels");
const options_1 = require("../../../../../../lib/options");
const load_shipment_context_1 = require("../../../../../../workflows/steps/load-shipment-context");
const utils_2 = require("../../../../../utils");
/**
 * `POST /admin/apaczka/fulfillments/:id/valuation` — price the shipment with
 * the given overrides before creating it. Returns the quote for the chosen
 * service plus the defaults the form should start from.
 */
async function POST(req, res) {
    const apaczka = (0, utils_2.resolveApaczka)(req);
    const options = apaczka.getOptions();
    const context = await (0, load_shipment_context_1.loadShipmentContext)(req.scope, req.params.id);
    const overrides = req.validatedBody.overrides ?? {};
    const serviceId = overrides.service_id ?? context.option.service_id;
    const items = context.items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        weight: item.variant?.weight,
        length: item.variant?.length,
        width: item.variant?.width,
        height: item.variant?.height,
    }));
    const itemsValue = context.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const payload = await (0, order_builder_1.buildOrderPayload)({
        options,
        option: context.option,
        purpose: "valuation",
        warehouse: (0, addresses_1.warehouseAddress)({
            location: context.location,
            defaults: options.sender,
            overrides: context.location_id ? options.senderByLocation[context.location_id] : undefined,
        }),
        customer: (0, addresses_1.customerAddress)(context.customer_address, context.email, context.option.is_return ? undefined : (overrides.point_id ?? context.data.point_id)),
        items,
        itemsValue,
        codAmount: context.order_total || itemsValue,
        overrides,
        displayId: context.display_id ?? undefined,
        orderId: context.order_id ?? undefined,
    });
    const valuation = await apaczka.getClient().valuateOrder(payload);
    const quote = valuation.price_table?.[String(serviceId)];
    if (!quote) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, `Apaczka service ${serviceId} cannot carry this shipment. Check the parcels and addresses.`);
    }
    res.json({
        service_id: serviceId,
        price_net: Number(quote.price),
        price_gross: Number(quote.price_gross),
        currency_code: "pln",
        defaults: {
            parcels: (0, parcels_1.buildParcels)({ items, options: (0, options_1.optionsForService)(options, serviceId).parcel }).map((parcel) => ({
                weight: parcel.weight,
                length: parcel.dimension1,
                width: parcel.dimension2,
                height: parcel.dimension3,
                package_type: parcel.shipment_type_code,
                non_standard: parcel.is_nstd === 1,
            })),
            cod_amount: payload.cod ? payload.cod.amount / 100 : 0,
            declared_value: payload.shipment_value ? payload.shipment_value / 100 : 0,
            point_id: payload.address.receiver.foreign_address_id ?? null,
        },
        sender_postal_code: payload.address.sender.postal_code,
        option: context.option,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2EvZnVsZmlsbG1lbnRzL1tpZF0vdmFsdWF0aW9uL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBZ0JBLG9CQXFFQztBQXBGRCxxREFBdUQ7QUFFdkQsK0RBQW1GO0FBQ25GLHVFQUF1RTtBQUN2RSwyREFBNEQ7QUFDNUQsMkRBQWlFO0FBQ2pFLG1HQUE2RjtBQUM3RixnREFBcUQ7QUFHckQ7Ozs7R0FJRztBQUNJLEtBQUssVUFBVSxJQUFJLENBQUMsR0FBdUMsRUFBRSxHQUFtQjtJQUNyRixNQUFNLE9BQU8sR0FBRyxJQUFBLHNCQUFjLEVBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkMsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFBO0lBQ3BDLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBQSwyQ0FBbUIsRUFBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDbkUsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLGFBQWEsQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFBO0lBQ25ELE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxVQUFVLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUE7SUFFbkUsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1FBQ2pCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtRQUN2QixNQUFNLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNO1FBQzVCLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU07UUFDNUIsS0FBSyxFQUFF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