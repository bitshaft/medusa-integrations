"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApaczkaFulfillmentProviderService = void 0;
const utils_1 = require("@medusajs/framework/utils");
const service_1 = __importDefault(require("./service"));
exports.ApaczkaFulfillmentProviderService = service_1.default;
exports.default = (0, utils_1.ModuleProvider)(utils_1.Modules.FULFILLMENT, {
    services: [service_1.default],
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvcHJvdmlkZXJzL2FwYWN6a2EvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEscURBQW1FO0FBRW5FLHdEQUF5RDtBQU1oRCw0Q0FORixpQkFBaUMsQ0FNRTtBQUoxQyxrQkFBZSxJQUFBLHNCQUFjLEVBQUMsZUFBTyxDQUFDLFdBQVcsRUFBRTtJQUNqRCxRQUFRLEVBQUUsQ0FBQyxpQkFBaUMsQ0FBQztDQUM5QyxDQUFDLENBQUEifQ==