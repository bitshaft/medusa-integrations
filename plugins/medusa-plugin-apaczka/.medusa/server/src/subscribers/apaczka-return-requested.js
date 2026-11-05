"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = apaczkaReturnRequested;
const utils_1 = require("@medusajs/framework/utils");
const data_1 = require("../lib/data");
const apaczka_1 = require("../modules/apaczka");
const create_apaczka_shipment_1 = require("../workflows/create-apaczka-shipment");
const sync_apaczka_shipment_record_1 = require("../workflows/sync-apaczka-shipment-record");
/**
 * Medusa does not give fulfillment providers the customer's address for
 * returns, so return labels are created here, right after the return is
 * confirmed. In `manual` mode the return is only recorded, and staff
 * create the label from the order page.
 */
async function apaczkaReturnRequested({ event, container }) {
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const apaczka = container.resolve(apaczka_1.APACZKA_MODULE);
    const { data: returns } = await query.graph({
        entity: "return",
        filters: { id: event.data.return_id },
        fields: ["id", "fulfillments.id", "fulfillments.provider_id", "fulfillments.data", "fulfillments.canceled_at"],
    });
    const fulfillments = (returns[0]?.fulfillments ?? []).filter((f) => Boolean(f) && !f.canceled_at && Boolean(f.provider_id?.startsWith("apaczka_")));
    for (const fulfillment of fulfillments) {
        const state = (0, data_1.readFulfillmentData)(fulfillment.data).apaczka;
        try {
            if (apaczka.getOptions().shipmentCreation === "auto" && state?.state === "pending") {
                await (0, create_apaczka_shipment_1.createApaczkaShipmentWorkflow)(container).run({ input: { fulfillment_id: fulfillment.id } });
            }
            else {
                await (0, sync_apaczka_shipment_record_1.syncApaczkaShipmentRecordWorkflow)(container).run({ input: { fulfillment_id: fulfillment.id } });
            }
        }
        catch (error) {
            logger.error(`[apaczka] Could not create the return label for return ${event.data.return_id}: ${error.message}. ` +
                "Create it from the order page.");
            await (0, sync_apaczka_shipment_record_1.syncApaczkaShipmentRecordWorkflow)(container)
                .run({ input: { fulfillment_id: fulfillment.id } })
                .catch(() => undefined);
        }
    }
}
exports.config = {
    event: "order.return_requested",
    context: { subscriberId: "apaczka-return-requested" },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBhY3prYS1yZXR1cm4tcmVxdWVzdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3N1YnNjcmliZXJzL2FwYWN6a2EtcmV0dXJuLXJlcXVlc3RlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFpQkEseUNBdUNDO0FBdkRELHFEQUFxRTtBQUVyRSxzQ0FBaUQ7QUFDakQsZ0RBQW1EO0FBRW5ELGtGQUFvRjtBQUNwRiw0RkFBNkY7QUFJN0Y7Ozs7O0dBS0c7QUFDWSxLQUFLLFVBQVUsc0JBQXNCLENBQUMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUEyQjtJQUNoRyxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLGlDQUF5QixDQUFDLE1BQU0sQ0FBQyxDQUFBO0lBQ2xFLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsS0FBSyxDQUFDLENBQUE7SUFDaEUsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBdUIsd0JBQWMsQ0FBQyxDQUFBO0lBRXZFLE1BQU0sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEdBQUcsTUFBTSxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQzFDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtRQUNyQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsMEJBQTBCLEVBQUUsbUJBQW1CLEVBQUUsMEJBQTBCLENBQUM7S0FDL0csQ0FBQyxDQUFBO0lBRUYsTUFBTSxZQUFZLEdBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsWUFBWSxJQUFJLEVBQUUsQ0FLM0MsQ0FBQyxNQUFNLENBQ2YsQ0FBQyxDQUFDLEVBQThCLEVBQUUsQ0FDaEMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBRSxDQUFDLFdBQVcsSUFBSSxPQUFPLENBQUMsQ0FBRSxDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FDbkYsQ0FBQTtJQUVELEtBQUssTUFBTSxXQUFXLElBQUksWUFBWSxFQUFFLENBQUM7UUFDdkMsTUFBTSxLQUFLLEdBQUcsSUFBQSwwQkFBbUIsRUFBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFBO1FBQzNELElBQUksQ0FBQztZQUNILElBQUksT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDLGdCQUFnQixLQUFLLE1BQU0sSUFBSSxLQUFLLEVBQUUsS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUNuRixNQUFNLElBQUEsdURBQTZCLEVBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsY0FBYyxFQUFFLFdBQVcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUE7WUFDbkcsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE1BQU0sSUFBQSxnRUFBaUMsRUFBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxjQUFjLEVBQUUsV0FBVyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQTtZQUN2RyxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUNWLDBEQUEwRCxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsS0FBTSxLQUFlLENBQUMsT0FBTyxJQUFJO2dCQUM3RyxnQ0FBZ0MsQ0FDbkMsQ0FBQTtZQUNELE1BQU0sSUFBQSxnRUFBaUMsRUFBQyxTQUFTLENBQUM7aUJBQy9DLEdBQUcsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLGNBQWMsRUFBRSxXQUFXLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQztpQkFDbEQsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFBO1FBQzNCLENBQUM7SUFDSCxDQUFDO0FBQ0gsQ0FBQztBQUVZLFFBQUEsTUFBTSxHQUFxQjtJQUN0QyxLQUFLLEVBQUUsd0JBQXdCO0lBQy9CLE9BQU8sRUFBRSxFQUFFLFlBQVksRUFBRSwwQkFBMEIsRUFBRTtDQUN0RCxDQUFBIn0=