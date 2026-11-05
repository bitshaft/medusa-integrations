"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
const apaczka_1 = require("../../../../lib/apaczka");
const tracking_1 = require("../../../../lib/tracking");
const sync_apaczka_tracking_1 = require("../../../../workflows/sync-apaczka-tracking");
const utils_2 = require("../../../utils");
/**
 * Receives Apaczka push-tracking notifications.
 *
 * - The signature is checked against the raw body; unsigned or tampered
 *   requests get HTTP 400 and change nothing.
 * - Apaczka redelivers until it gets HTTP 200, and holds back the next
 *   status until then, so known-but-irrelevant notifications (unknown order,
 *   empty status list) are acknowledged with 200. Processing is idempotent.
 * - Unexpected failures return 500 so the notification is retried.
 */
async function POST(req, res) {
    const apaczka = (0, utils_2.resolveApaczka)(req);
    const logger = req.scope.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    const options = apaczka.getOptions();
    const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
    let notification;
    try {
        notification = (0, apaczka_1.verifyPushTrackingWebhook)({
            appId: options.appId,
            appSecret: options.appSecret,
            rawBody,
        });
    }
    catch (error) {
        if (error instanceof apaczka_1.ApaczkaWebhookError) {
            logger.warn(`[apaczka] Rejected tracking webhook: ${error.message}`);
            return res.status(400).json({ message: "Invalid webhook signature" });
        }
        throw error;
    }
    const apaczkaOrderId = String(notification.orderNumber ?? "");
    const [shipment] = apaczkaOrderId
        ? await apaczka.listApaczkaShipments({ apaczka_order_id: apaczkaOrderId }, { take: 1 })
        : [];
    if (!shipment) {
        logger.info(`[apaczka] Tracking webhook for unknown Apaczka order ${apaczkaOrderId || "(none)"}; acknowledged`);
        return res.status(200).json({ received: true, matched: false });
    }
    const events = (0, tracking_1.eventsFromWebhook)(notification);
    if (events.length) {
        await (0, sync_apaczka_tracking_1.syncApaczkaTrackingWorkflow)(req.scope).run({
            input: { shipment_id: shipment.id, events },
        });
    }
    return res.status(200).json({ received: true, matched: true, events: events.length });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2hvb2tzL2FwYWN6a2EvdHJhY2tpbmcvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFtQkEsb0JBd0NDO0FBekRELHFEQUFxRTtBQUVyRSxxREFBd0Y7QUFDeEYsdURBQTREO0FBQzVELHVGQUF5RjtBQUN6RiwwQ0FBK0M7QUFFL0M7Ozs7Ozs7OztHQVNHO0FBQ0ksS0FBSyxVQUFVLElBQUksQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ2hFLE1BQU0sT0FBTyxHQUFHLElBQUEsc0JBQWMsRUFBQyxHQUFHLENBQUMsQ0FBQTtJQUNuQyxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBUyxpQ0FBeUIsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUMxRSxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUE7SUFFcEMsTUFBTSxPQUFPLEdBQUksR0FBNEMsQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFBO0lBRXZHLElBQUksWUFBWSxDQUFBO0lBQ2hCLElBQUksQ0FBQztRQUNILFlBQVksR0FBRyxJQUFBLG1DQUF5QixFQUFDO1lBQ3ZDLEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSztZQUNwQixTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVM7WUFDNUIsT0FBTztTQUNSLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsSUFBSSxLQUFLLFlBQVksNkJBQW1CLEVBQUUsQ0FBQztZQUN6QyxNQUFNLENBQUMsSUFBSSxDQUFDLHdDQUF3QyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQTtZQUNwRSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLENBQUMsQ0FBQTtRQUN2RSxDQUFDO1FBQ0QsTUFBTSxLQUFLLENBQUE7SUFDYixDQUFDO0lBRUQsTUFBTSxjQUFjLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxXQUFXLElBQUksRUFBRSxDQUFDLENBQUE7SUFDN0QsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLGNBQWM7UUFDL0IsQ0FBQyxDQUFDLE1BQU0sT0FBTyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDdkYsQ0FBQyxDQUFDLEVBQUUsQ0FBQTtJQUVOLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNkLE1BQU0sQ0FBQyxJQUFJLENBQUMsd0RBQXdELGNBQWMsSUFBSSxRQUFRLGdCQUFnQixDQUFDLENBQUE7UUFDL0csT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUE7SUFDakUsQ0FBQztJQUVELE1BQU0sTUFBTSxHQUFHLElBQUEsNEJBQWlCLEVBQUMsWUFBWSxDQUFDLENBQUE7SUFDOUMsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDbEIsTUFBTSxJQUFBLG1EQUEyQixFQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFDL0MsS0FBSyxFQUFFLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFO1NBQzVDLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFFRCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQTtBQUN2RixDQUFDIn0=