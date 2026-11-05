"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fulfillment_1 = __importDefault(require("@medusajs/medusa/fulfillment"));
const utils_1 = require("@medusajs/framework/utils");
const apaczka_1 = __importDefault(require("../modules/apaczka"));
/**
 * Read-only link (no pivot table): `apaczka_shipment.fulfillment_id` points
 * at the fulfillment, so Query can join them in both directions:
 *
 * ```ts
 * query.graph({ entity: "fulfillment", fields: ["id", "apaczka_shipment.*"] })
 * ```
 */
exports.default = (0, utils_1.defineLink)({
    linkable: fulfillment_1.default.linkable.fulfillment,
    field: "id",
}, {
    ...apaczka_1.default.linkable.apaczkaShipment.id,
    primaryKey: "fulfillment_id",
}, { readOnly: true });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBhY3prYS1zaGlwbWVudC1mdWxmaWxsbWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9saW5rcy9hcGFjemthLXNoaXBtZW50LWZ1bGZpbGxtZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsK0VBQTREO0FBQzVELHFEQUFzRDtBQUV0RCxpRUFBOEM7QUFFOUM7Ozs7Ozs7R0FPRztBQUNILGtCQUFlLElBQUEsa0JBQVUsRUFDdkI7SUFDRSxRQUFRLEVBQUUscUJBQWlCLENBQUMsUUFBUSxDQUFDLFdBQVc7SUFDaEQsS0FBSyxFQUFFLElBQUk7Q0FDWixFQUNEO0lBQ0UsR0FBRyxpQkFBYSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsRUFBRTtJQUM1QyxVQUFVLEVBQUUsZ0JBQWdCO0NBQzdCLEVBQ0QsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQ25CLENBQUEifQ==