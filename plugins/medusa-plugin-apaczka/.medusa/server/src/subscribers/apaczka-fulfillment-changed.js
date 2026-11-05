"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = apaczkaFulfillmentChanged;
const utils_1 = require("@medusajs/framework/utils");
const sync_apaczka_shipment_record_1 = require("../workflows/sync-apaczka-shipment-record");
/**
 * Mirrors Apaczka fulfillments into the shipment table when Medusa creates
 * or cancels them. Fulfillments of other providers are ignored.
 */
async function apaczkaFulfillmentChanged({ event, container }) {
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    try {
        await (0, sync_apaczka_shipment_record_1.syncApaczkaShipmentRecordWorkflow)(container).run({
            input: { fulfillment_id: event.data.fulfillment_id },
        });
    }
    catch (error) {
        logger.error(`[apaczka] Could not sync shipment for fulfillment ${event.data.fulfillment_id}: ${error.message}`);
    }
}
exports.config = {
    event: ["order.fulfillment_created", "order.fulfillment_canceled"],
    context: { subscriberId: "apaczka-fulfillment-changed" },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBhY3prYS1mdWxmaWxsbWVudC1jaGFuZ2VkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3N1YnNjcmliZXJzL2FwYWN6a2EtZnVsZmlsbG1lbnQtY2hhbmdlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFXQSw0Q0FXQztBQXJCRCxxREFBcUU7QUFFckUsNEZBQTZGO0FBSTdGOzs7R0FHRztBQUNZLEtBQUssVUFBVSx5QkFBeUIsQ0FBQyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQTJCO0lBQ25HLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsTUFBTSxDQUFDLENBQUE7SUFDbEUsSUFBSSxDQUFDO1FBQ0gsTUFBTSxJQUFBLGdFQUFpQyxFQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUNyRCxLQUFLLEVBQUUsRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUU7U0FDckQsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixNQUFNLENBQUMsS0FBSyxDQUNWLHFEQUFxRCxLQUFLLENBQUMsSUFBSSxDQUFDLGNBQWMsS0FBTSxLQUFlLENBQUMsT0FBTyxFQUFFLENBQzlHLENBQUE7SUFDSCxDQUFDO0FBQ0gsQ0FBQztBQUVZLFFBQUEsTUFBTSxHQUFxQjtJQUN0QyxLQUFLLEVBQUUsQ0FBQywyQkFBMkIsRUFBRSw0QkFBNEIsQ0FBQztJQUNsRSxPQUFPLEVBQUUsRUFBRSxZQUFZLEVBQUUsNkJBQTZCLEVBQUU7Q0FDekQsQ0FBQSJ9