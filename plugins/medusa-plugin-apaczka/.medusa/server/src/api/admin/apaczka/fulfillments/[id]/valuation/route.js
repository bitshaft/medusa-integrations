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
    const options = await apaczka.getOptions();
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
    const valuation = await (await apaczka.getClient()).valuateOrder(payload);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2EvZnVsZmlsbG1lbnRzL1tpZF0vdmFsdWF0aW9uL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBZ0JBLG9CQXFFQztBQXBGRCxxREFBdUQ7QUFFdkQsK0RBQW1GO0FBQ25GLHVFQUF1RTtBQUN2RSwyREFBNEQ7QUFDNUQsMkRBQWlFO0FBQ2pFLG1HQUE2RjtBQUM3RixnREFBcUQ7QUFHckQ7Ozs7R0FJRztBQUNJLEtBQUssVUFBVSxJQUFJLENBQUMsR0FBdUMsRUFBRSxHQUFtQjtJQUNyRixNQUFNLE9BQU8sR0FBRyxJQUFBLHNCQUFjLEVBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkMsTUFBTSxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUE7SUFDMUMsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFBLDJDQUFtQixFQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUNuRSxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsYUFBYSxDQUFDLFNBQVMsSUFBSSxFQUFFLENBQUE7SUFDbkQsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLFVBQVUsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQTtJQUVuRSxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN6QyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7UUFDakIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1FBQ3ZCLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU07UUFDNUIsTUFBTSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsTUFBTTtRQUM1QixLQUFL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