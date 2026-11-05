"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fulfillmentOptionId = fulfillmentOptionId;
exports.buildFulfillmentOptions = buildFulfillmentOptions;
exports.describeService = describeService;
exports.resolvePointsType = resolvePointsType;
exports.parseFulfillmentOption = parseFulfillmentOption;
const apaczka_1 = require("./apaczka");
function fulfillmentOptionId(serviceId, variant) {
    return variant === "standard" ? `apaczka-${serviceId}` : `apaczka-${serviceId}-${variant}`;
}
/** Builds the list shown in the admin's "Create shipping option" form. */
function buildFulfillmentOptions(structure, options) {
    const pointTypes = (0, apaczka_1.toArray)(structure.points_type).map(String);
    const enabled = new Set(options.enabledServices);
    const services = (0, apaczka_1.toArray)(structure.services)
        .map((service) => ({ ...service, service_id: Number(service.service_id) }))
        .filter((service) => Number.isFinite(service.service_id))
        .filter((service) => enabled.size === 0 || enabled.has(service.service_id))
        .sort((a, b) => `${a.supplier} ${a.name}`.localeCompare(`${b.supplier} ${b.name}`, "pl"));
    const result = [];
    for (const service of services) {
        const base = describeService(service, options, pointTypes);
        result.push(base);
        if (options.offerCodVariants) {
            result.push({
                ...base,
                id: fulfillmentOptionId(base.service_id, "cod"),
                name: `${base.name} — COD`,
                cod: true,
            });
        }
        // Returns are sent by the customer to the warehouse, so they only make
        // sense for services that deliver to a street address.
        if (options.offerReturnVariants && base.destination === "door") {
            result.push({
                ...base,
                id: fulfillmentOptionId(base.service_id, "return"),
                name: `${base.name} — return`,
                is_return: true,
            });
        }
    }
    return result;
}
function describeService(service, options, pointTypes = []) {
    const serviceId = Number(service.service_id);
    const flag = (key) => Number(service[key] ?? 0);
    const toPoint = flag("door_to_point") === 1 || flag("point_to_point") === 1;
    const toDoor = flag("door_to_door") === 1 || flag("point_to_door") === 1;
    // Sender must use a point only when no door-pickup routing exists.
    const fromPoint = (flag("point_to_point") === 1 || flag("point_to_door") === 1) &&
        flag("door_to_door") !== 1 &&
        flag("door_to_point") !== 1;
    const supplier = String(service.supplier ?? "").trim();
    const displayName = options.services[String(serviceId)]?.name ?? `${supplier} ${service.name}`.trim();
    return {
        id: fulfillmentOptionId(serviceId, "standard"),
        name: displayName,
        service_id: serviceId,
        service_name: String(service.name ?? ""),
        supplier,
        cod: false,
        is_return: false,
        origin: fromPoint ? "point" : "door",
        // A service that can do both is treated as door delivery; point
        // delivery is chosen per order by sending a `point_id`.
        destination: toPoint && !toDoor ? "point" : "door",
        domestic: service.domestic === undefined ? true : flag("domestic") === 1,
        pickup_courier: clampFlag(flag("pickup_courier")),
        points_type: resolvePointsType(supplier, options.pointTypes, pointTypes),
    };
}
/**
 * Maps a supplier to its `points/{type}/` code: explicit option first, then
 * an exact match in the account's `points_type` list, then a prefix match,
 * then the supplier code itself.
 */
function resolvePointsType(supplier, configured, available) {
    if (!supplier) {
        return undefined;
    }
    const upper = supplier.toUpperCase();
    const explicit = configured[supplier] ?? configured[upper];
    if (explicit) {
        return explicit;
    }
    const exact = available.find((type) => type.toUpperCase() === upper);
    if (exact) {
        return exact;
    }
    const firstWord = upper.split(/[\s_-]+/)[0];
    const prefix = available.find((type) => type.toUpperCase().startsWith(firstWord));
    return prefix ?? upper;
}
/** Narrows `shipping_option.data` to our option shape, or returns undefined. */
function parseFulfillmentOption(data) {
    if (!data || typeof data !== "object") {
        return undefined;
    }
    const candidate = data;
    const serviceId = Number(candidate.service_id);
    if (!Number.isInteger(serviceId) || typeof candidate.id !== "string" || !candidate.id.startsWith("apaczka-")) {
        return undefined;
    }
    return {
        id: candidate.id,
        name: String(candidate.name ?? candidate.id),
        service_id: serviceId,
        service_name: String(candidate.service_name ?? ""),
        supplier: String(candidate.supplier ?? ""),
        cod: Boolean(candidate.cod),
        is_return: Boolean(candidate.is_return),
        origin: candidate.origin === "point" ? "point" : "door",
        destination: candidate.destination === "point" ? "point" : "door",
        domestic: candidate.domestic !== false,
        pickup_courier: clampFlag(Number(candidate.pickup_courier ?? 1)),
        points_type: candidate.points_type,
    };
}
function clampFlag(value) {
    return value === 0 ? 0 : value === 2 ? 2 : 1;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnVsZmlsbG1lbnQtb3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9saWIvZnVsZmlsbG1lbnQtb3B0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWdDQSxrREFFQztBQUdELDBEQTJDQztBQUVELDBDQWtDQztBQU9ELDhDQW9CQztBQUdELHdEQXVCQztBQXhLRCx1Q0FBbUM7QUErQm5DLFNBQWdCLG1CQUFtQixDQUFDLFNBQWlCLEVBQUUsT0FBc0M7SUFDM0YsT0FBTyxPQUFPLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQyxXQUFXLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLFNBQVMsSUFBSSxPQUFPLEVBQUUsQ0FBQTtBQUM1RixDQUFDO0FBRUQsMEVBQTBFO0FBQzFFLFNBQWdCLHVCQUF1QixDQUNyQyxTQUFrQyxFQUNsQyxPQUdDO0lBRUQsTUFBTSxVQUFVLEdBQUcsSUFBQSxpQkFBTyxFQUFDLFNBQVMsQ0FBQyxXQUE0RCxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO0lBQzlHLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQTtJQUVoRCxNQUFNLFFBQVEsR0FBRyxJQUFBLGlCQUFPLEVBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQztTQUN6QyxHQUFHLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDMUUsTUFBTSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztTQUN4RCxNQUFNLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssQ0FB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