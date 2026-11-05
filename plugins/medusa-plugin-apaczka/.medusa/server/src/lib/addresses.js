"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerAddress = customerAddress;
exports.warehouseAddress = warehouseAddress;
exports.missingAddressFields = missingAddressFields;
exports.assertCompleteAddress = assertCompleteAddress;
exports.formatPostalCode = formatPostalCode;
exports.normalizePhone = normalizePhone;
const utils_1 = require("@medusajs/framework/utils");
/** The customer side of a shipment (receiver, or sender on returns). */
function customerAddress(address, email, pointId) {
    if (!address) {
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "A shipping address is required for Apaczka shipments");
    }
    const person = [address.first_name, address.last_name].filter(Boolean).join(" ").trim();
    const name = address.company?.trim() || person;
    return compact({
        name,
        contact_person: person || undefined,
        line1: address.address_1?.trim() ?? "",
        line2: address.address_2?.trim() || undefined,
        postal_code: formatPostalCode(address.postal_code, address.country_code),
        city: address.city?.trim() ?? "",
        country_code: (address.country_code ?? "pl").toUpperCase(),
        state_code: address.province?.trim() || undefined,
        phone: normalizePhone(address.phone),
        email: email ?? undefined,
        is_residential: !address.company,
        foreign_address_id: pointId,
    });
}
/**
 * The warehouse side of a shipment. Precedence (highest first):
 * per-location overrides → the stock location's address → global defaults.
 */
function warehouseAddress(input) {
    const { defaults, overrides = {} } = input;
    const address = input.location?.address ?? {};
    const pick = (key, fromLocation) => overrides[key] ?? (fromLocation || undefined) ?? defaults[key];
    const countryCode = (pick("countryCode", address.country_code) ?? "PL").toUpperCase();
    return compact({
        name: pick("name", address.company || input.location?.name) ?? "",
        contact_person: pick("contactPerson"),
        line1: pick("line1", address.address_1) ?? "",
        line2: pick("line2", address.address_2),
        postal_code: formatPostalCode(pick("postalCode", address.postal_code), countryCode),
        city: pick("city", address.city) ?? "",
        country_code: countryCode,
        phone: normalizePhone(pick("phone", address.phone)),
        email: pick("email"),
        is_residential: pick("isResidential") ?? false,
        foreign_address_id: pick("pointId"),
    });
}
/** Lists the fields Apaczka needs that are empty, for clear error messages. */
function missingAddressFields(address) {
    const required = ["name", "line1", "postal_code", "city", "country_code"];
    return required.filter((key) => !address[key]);
}
function assertCompleteAddress(address, role) {
    const missing = missingAddressFields(address);
    if (missing.length) {
        const hint = role === "sender"
            ? " Fill in the stock location address, or set `sender` / `senderByLocation` in the plugin options."
            : "";
        throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Apaczka ${role} address is missing: ${missing.join(", ")}.${hint}`);
    }
}
/** Polish postal codes are `00-000`; customers often type `00000`. */
function formatPostalCode(postalCode, countryCode) {
    const value = (postalCode ?? "").trim();
    if ((countryCode ?? "pl").toLowerCase() === "pl" && /^\d{5}$/.test(value)) {
        return `${value.slice(0, 2)}-${value.slice(2)}`;
    }
    return value;
}
/** Strips spaces, dashes and brackets; keeps a leading `+`. */
function normalizePhone(phone) {
    if (!phone) {
        return undefined;
    }
    const cleaned = phone.trim().replace(/[\s\-().]/g, "");
    return cleaned.length ? cleaned : undefined;
}
function compact(value) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRkcmVzc2VzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2xpYi9hZGRyZXNzZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUEwQkEsMENBMEJDO0FBTUQsNENBMEJDO0FBR0Qsb0RBR0M7QUFFRCxzREFZQztBQUdELDRDQU1DO0FBR0Qsd0NBTUM7QUExSEQscURBQXVEO0FBeUJ2RCx3RUFBd0U7QUFDeEUsU0FBZ0IsZUFBZSxDQUM3QixPQUE2QyxFQUM3QyxLQUFnQyxFQUNoQyxPQUFnQjtJQUVoQixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDYixNQUFNLElBQUksbUJBQVcsQ0FBQyxtQkFBVyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsc0RBQXNELENBQUMsQ0FBQTtJQUMvRyxDQUFDO0lBRUQsTUFBTSxNQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFBO0lBQ3ZGLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksTUFBTSxDQUFBO0lBRTlDLE9BQU8sT0FBTyxDQUFDO1FBQ2IsSUFBSTtRQUNKLGNBQWMsRUFBRSxNQUFNLElBQUksU0FBUztRQUNuQyxLQUFLLEVBQUUsT0FBTyxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFO1FBQ3RDLEtBQUssRUFBRSxPQUFPLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxJQUFJLFNBQVM7UUFDN0MsV0FBVyxFQUFFLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLFlBQVksQ0FBQztRQUN4RSxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFO1FBQ2hDLFlBQVksRUFBRSxDQUFDLE9BQU8sQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLENBQUMsV0FBVyxFQUFFO1FBQzFELFVBQVUsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxJQUFJLFNBQVM7UUFDakQsS0FBSyxFQUFFLGNBQWMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQ3BDLEtBQUssRUFBRSxLQUFLLElBQUksU0FBUztRQUN6QixjQUFjLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTztRQUNoQyxrQkFBa0IsRUFBRSxPQUFPO0tBQzVCLENBQUMsQ0FBQTtBQUNKLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxTQUFnQixnQkFBZ0IsQ0FBQyxLQUloQztJQUNDLE1BQU0sRUFBRSxRQUFRLEVBQUUsU0FBUyxHQUFHLEVBQUUsRUFBRSxHQUFHLEtBQUssQ0FBQTtJQUMxQyxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsUUFBUSxFQUFFLE9BQU8sSUFBSSxFQUFFLENBQUE7SUFFN0MsTUFBTSxJQUFJLEdBQUcsQ0FBZ0MsR0FBTSxFQUFFLFlBQXNDLEVBQUUsRUFBRSxDQUM3RixTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksU0FBUyxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBRWhFLE1BQU0sV0FBVyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUE7SUFFckYsT0FBTyxPQUFPLENBQUM7UUFDYixJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsT0FBTyxJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRTtRQUNqRSxjQUFjLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQztRQUNyQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRTtRQUM3QyxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDO1FBQ3ZDLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxXQUFXLENBQUMsRUFBRSxXQUFXLENBQUM7UUFDbkYsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7UUFDdEMsWUFBWSxFQUFFLFdBQVc7UUFDekIsS0FBSyxFQUFFLGNBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNuRCxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUNwQixjQUFjLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEtBQUs7UUFDOUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztLQUNwQyxDQUFDLENBQUE7QUFDSixDQUFDO0FBRUQsK0VBQStFO0FBQy9FLFNBQWdCLG9CQUFvQixDQUFDLE9BQXVCO0lBQzFELE1BQU0sUUFBUSxHQUFnQyxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQTtJQUN0RyxPQUFPLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7QUFDaEQsQ0FBQztBQUVELFNBQWdCLHFCQUFxQixDQUFDLE9BQXVCLEVBQUUsSUFBMkI7SUFDeEYsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsT0FBTyxDQUFDLENBQUE7SUFDN0MsSUFBSSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDbkIsTUFBTSxJQUFJLEdBQ1IsSUFBSSxLQUFLLFFBQVE7WUFDZixDQUFDLENBQUMsa0dBQWtHO1lBQ3BHLENBQUMsQ0FBQyxFQUFFLENBQUE7UUFDUixNQUFNLElBQUksbUJBQVcsQ0FDbkIsbUJBQVcsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUM5QixXQUFXLElBQUksd0JBQXdCLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFLENBQ3BFLENBQUE7SUFDSCxDQUFDO0FBQ0gsQ0FBQztBQUVELHNFQUFzRTtBQUN0RSxTQUFnQixnQkFBZ0IsQ0FBQyxVQUFxQyxFQUFFLFdBQTJCO0lBQ2pHLE1BQU0sS0FBSyxHQUFHLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFBO0lBQ3ZDLElBQUksQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssSUFBSSxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMxRSxPQUFPLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBO0lBQ2pELENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQTtBQUNkLENBQUM7QUFFRCwrREFBK0Q7QUFDL0QsU0FBZ0IsY0FBYyxDQUFDLEtBQWdDO0lBQzdELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNYLE9BQU8sU0FBUyxDQUFBO0lBQ2xCLENBQUM7SUFDRCxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQTtJQUN0RCxPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFBO0FBQzdDLENBQUM7QUFFRCxTQUFTLE9BQU8sQ0FBb0MsS0FBUTtJQUMxRCxPQUFPLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxTQUFTLENBQUMsQ0FBTSxDQUFBO0FBQzFGLENBQUMifQ==