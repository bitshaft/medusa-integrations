"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const order_1 = __importDefault(require("@medusajs/medusa/order"));
const utils_1 = require("@medusajs/framework/utils");
const apaczka_1 = __importDefault(require("../modules/apaczka"));
/**
 * Read-only link from an order to its Apaczka shipments:
 *
 * ```ts
 * query.graph({ entity: "order", fields: ["id", "apaczka_shipments.*"] })
 * ```
 */
exports.default = (0, utils_1.defineLink)({
    linkable: order_1.default.linkable.order,
    field: "id",
}, {
    ...apaczka_1.default.linkable.apaczkaShipment.id,
    primaryKey: "order_id",
    isList: true,
}, { readOnly: true });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBhY3prYS1zaGlwbWVudC1vcmRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9saW5rcy9hcGFjemthLXNoaXBtZW50LW9yZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsbUVBQWdEO0FBQ2hELHFEQUFzRDtBQUV0RCxpRUFBOEM7QUFFOUM7Ozs7OztHQU1HO0FBQ0gsa0JBQWUsSUFBQSxrQkFBVSxFQUN2QjtJQUNFLFFBQVEsRUFBRSxlQUFXLENBQUMsUUFBUSxDQUFDLEtBQUs7SUFDcEMsS0FBSyxFQUFFLElBQUk7Q0FDWixFQUNEO0lBQ0UsR0FBRyxpQkFBYSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsRUFBRTtJQUM1QyxVQUFVLEVBQUUsVUFBVTtJQUN0QixNQUFNLEVBQUUsSUFBSTtDQUNiLEVBQ0QsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQ25CLENBQUEifQ==