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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXItYnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9saWIvb3JkZXItYnVpbGRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFzQ0EsOENBdUdDO0FBY0Qsd0NBZ0JDO0FBM0tELHFEQUF1RDtBQUt2RCxtQ0FBa0M7QUFDbEMsdUNBQW9HO0FBQ3BHLHVDQUF5RDtBQUU1QyxRQUFBLFlBQVksR0FBRyx5QkFBeUIsQ0FBQTtBQXVCckQ7Ozs7O0dBS0c7QUFDSSxLQUFLLFVBQVUsaUJBQWlCLENBQUMsS0FBc0I7SUFDNUQsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsU0FBUyxHQUFHLEVBQUUsRUFBRSxHQUFHLEtBQUssQ0FBQTtJQUNqRCxNQUFNLFNBQVMsR0FBRyxTQUFTLENBQUMsVUFBVSxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUE7SUFDM0QsTUFBTSxNQUFNLEdBQUcsSUFBQSwyQkFBaUIsRUFBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUE7SUFDcEQsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQTtJQUVqQyxNQUFNLE1BQU0sR0FBbUIsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFBO0lBQ3hGLE1BQU0sUUFBUSxHQUFtQixRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUE7SUFFMUYsSUFBSSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDdkIsUUFBUSxDQUFDLGtCQUFrQixHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUE7SUFDbEQsQ0FBQztJQUVELElBQUksQ0FBQyxRQUFRLElBQUksTUFBTSxDQUFD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