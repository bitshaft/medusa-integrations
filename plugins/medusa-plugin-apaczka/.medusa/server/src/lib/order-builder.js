"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEBHOOK_PATH = void 0;
exports.buildOrderPayload = buildOrderPayload;
exports.renderTemplate = renderTemplate;
const utils_1 = require("@medusajs/framework/utils");
const money_1 = require("./money");
const options_1 = require("./options");
const parcels_1 = require("./parcels");
exports.WEBHOOK_PATH = "/hooks/apaczka/tracking";
/**
 * Builds the `order` payload for `order_valuation` / `order_send`.
 *
 * Pure function of its input: the same input always gives the same payload,
 * so a price quote and the final order cannot drift apart.
 */
async function buildOrderPayload(input) {
    const { options, option, overrides = {} } = input;
    const serviceId = overrides.service_id ?? option.service_id;
    const scoped = (0, options_1.optionsForService)(options, serviceId);
    const isReturn = option.is_return;
    const sender = isReturn ? { ...input.customer } : { ...input.warehouse };
    const receiver = isReturn ? { ...input.warehouse } : { ...input.customer };
    if (overrides.point_id) {
        receiver.foreign_address_id = overrides.point_id;
    }
    if (!isReturn && option.destination === "point" && !receiver.foreign_address_id && input.purpose === "shipment") {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `${option.name} delivers to a parcel point, but no point was chosen. ` +
            "Send `point_id` in the shipping method data at checkout, or set it when creating the shipment.");
    }
    const content = renderTemplate(overrides.content ?? options.contentTemplate, input);
    const comment = overrides.comment ?? (options.commentTemplate ? renderTemplate(options.commentTemplate, input) : undefined);
    const parcels = overrides.parcels?.length
        ? overrides.parcels.map((parcel) => ({
            shipment_type_code: parcel.package_type ?? scoped.parcel.packageType,
            dimension1: Math.max(1, Math.ceil(parcel.length)),
            dimension2: Math.max(1, Math.ceil(parcel.width)),
            dimension3: Math.max(1, Math.ceil(parcel.height)),
            weight: Math.ceil(parcel.weight * 100) / 100,
            is_nstd: parcel.non_standard ? 1 : 0,
        }))
        : (options.buildParcels ?? parcels_1.buildParcels)({
            items: input.items,
            options: scoped.parcel,
            serviceId,
            content,
        });
    if (!parcels.length) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "An Apaczka shipment needs at least one parcel");
    }
    const order = {
        service_id: serviceId,
        address: { sender, receiver },
        shipment: parcels,
        pickup: overrides.pickup ?? input.pickup ?? { type: "SELF" },
        content,
        ...(comment ? { comment } : {}),
    };
    // Cash on delivery
    const codAmount = overrides.cod_amount ?? (option.cod && !isReturn ? input.codAmount : undefined);
    if (codAmount && codAmount > 0) {
        if (!options.cod.bankAccount && !options.cod.bankAccountId) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Cash on delivery needs a payout account: set `cod.bankAccount` (IBAN) or `cod.bankAccountId` in the plugin options.");
        }
        order.cod = {
            amount: (0, money_1.toGrosze)(codAmount),
            ...(options.cod.bankAccount ? { bankaccount: options.cod.bankAccount.replace(/\s/g, "") } : {}),
            ...(options.cod.bankAccountId ? { bankaccount_id: options.cod.bankAccountId } : {}),
        };
    }
    // Declared value (insurance). Carriers expect it to cover the COD amount.
    const declared = overrides.declared_value ?? declaredValue(options, input.itemsValue);
    const declaredGrosze = Math.max(declared ? (0, money_1.toGrosze)(declared) : 0, order.cod?.amount ?? 0);
    if (declaredGrosze > 0) {
        order.shipment_value = declaredGrosze;
    }
    const additional = { ...scoped.additionalServices, ...overrides.options };
    if (Object.keys(additional).length) {
        order.option = additional;
    }
    if (options.notifications) {
        order.notification = options.notifications;
    }
    if (options.labelFormat === "zpl") {
        order.is_zebra = true;
    }
    if (input.purpose === "shipment" && options.webhooks.backendUrl) {
        order.push_tracking_url = options.webhooks.backendUrl.replace(/\/+$/, "") + exports.WEBHOOK_PATH;
    }
    if (options.transformOrder) {
        return options.transformOrder(order, {
            purpose: input.purpose,
            serviceId,
            isReturn,
            orderId: input.orderId,
            cartId: input.cartId,
        });
    }
    return order;
}
function declaredValue(options, itemsValue) {
    switch (options.insurance.mode) {
        case "order_total":
            return itemsValue;
        case "fixed":
            return options.insurance.amount;
        default:
            return undefined;
    }
}
/** Replaces `{display_id}`, `{order_id}` and `{items}` placeholders. */
function renderTemplate(template, input) {
    const items = input.items
        .map((item) => (item.title ? `${item.quantity}× ${item.title}` : ""))
        .filter(Boolean)
        .join(", ");
    return template
        .replace(/\{display_id\}/g, String(input.displayId ?? ""))
        .replace(/\{order_id\}/g, input.orderId ?? "")
        .replace(/\{items\}/g, items)
        .replace(/\s*#\s*$/, "")
        .trim()
        .slice(0, 255);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXItYnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9saWIvb3JkZXItYnVpbGRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFzQ0EsOENBc0dDO0FBY0Qsd0NBYUM7QUF2S0QscURBQXVEO0FBS3ZELG1DQUFrQztBQUNsQyx1Q0FBb0c7QUFDcEcsdUNBQXlEO0FBRTVDLFFBQUEsWUFBWSxHQUFHLHlCQUF5QixDQUFBO0FBdUJyRDs7Ozs7R0FLRztBQUNJLEtBQUssVUFBVSxpQkFBaUIsQ0FBQyxLQUFzQjtJQUM1RCxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLEdBQUcsRUFBRSxFQUFFLEdBQUcsS0FBSyxDQUFBO0lBQ2pELE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxVQUFVLElBQUksTUFBTSxDQUFDLFVBQVUsQ0FBQTtJQUMzRCxNQUFNLE1BQU0sR0FBRyxJQUFBLDJCQUFpQixFQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQTtJQUNwRCxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFBO0lBRWpDLE1BQU0sTUFBTSxHQUFtQixRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUE7SUFDeEYsTUFBTSxRQUFRLEdBQW1CLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQTtJQUUxRixJQUFJLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUN2QixRQUFRLENBQUMsa0JBQWtCLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQTtJQUNsRCxDQUFDO0lBRUQsSUFBSSxDQUFDLFFBQVEsSUFBSSxNQUFNLENBQUMs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