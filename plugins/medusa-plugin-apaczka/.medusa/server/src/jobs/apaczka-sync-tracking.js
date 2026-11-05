"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = apaczkaSyncTracking;
const utils_1 = require("@medusajs/framework/utils");
const apaczka_1 = require("../lib/apaczka");
const statuses_1 = require("../lib/apaczka/statuses");
const apaczka_2 = require("../modules/apaczka");
const poll_tracking_1 = require("../workflows/helpers/poll-tracking");
const BATCH_SIZE = 200;
const CONCURRENCY = 4;
/** Skip shipments synced more recently than this. */
const MIN_INTERVAL_MS = 25 * 60_000;
/** Stop polling shipments that have not finished after this long. */
const MAX_AGE_MS = 60 * 24 * 60 * 60_000;
/**
 * Backup for push tracking: polls `tracking/` for active shipments every
 * 30 minutes. Disable with `tracking.polling: false`.
 *
 * Note: `tracking/` is not available on the Apaczka sandbox.
 */
async function apaczkaSyncTracking(container) {
    const apaczka = container.resolve(apaczka_2.APACZKA_MODULE);
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    if (!(await apaczka.getOptions()).tracking.polling) {
        return;
    }
    const now = Date.now();
    const active = Object.values(statuses_1.ShipmentStatus).filter((status) => !statuses_1.TERMINAL_STATUSES.has(status) && status !== statuses_1.ShipmentStatus.PENDING);
    const shipments = await apaczka.listApaczkaShipments({ status: active, created_at: { $gte: new Date(now - MAX_AGE_MS) } }, { order: { last_synced_at: "ASC" }, take: BATCH_SIZE, select: ["id", "waybill_number", "last_synced_at"] });
    const due = shipments.filter((s) => s.waybill_number && (!s.last_synced_at || now - new Date(s.last_synced_at).getTime() > MIN_INTERVAL_MS));
    if (!due.length) {
        return;
    }
    let changed = 0;
    let failed = 0;
    const queue = [...due];
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let shipment = queue.shift(); shipment; shipment = queue.shift()) {
            try {
                const result = await (0, poll_tracking_1.pollShipmentTracking)(container, shipment.id);
                if (result.changed) {
                    changed++;
                }
            }
            catch (error) {
                failed++;
                const message = error instanceof apaczka_1.ApaczkaApiError ? `${error.message} (status ${error.status})` : error.message;
                logger.warn(`[apaczka] Tracking poll failed for shipment ${shipment.id}: ${message}`);
            }
        }
    }));
    logger.info(`[apaczka] Polled ${due.length} shipments: ${changed} changed, ${failed} failed`);
}
exports.config = {
    name: "apaczka-sync-tracking",
    schedule: "*/30 * * * *",
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBhY3prYS1zeW5jLXRyYWNraW5nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2pvYnMvYXBhY3prYS1zeW5jLXRyYWNraW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQXNCQSxzQ0ErQ0M7QUFwRUQscURBQXFFO0FBRXJFLDRDQUFnRDtBQUNoRCxzREFBMkU7QUFDM0UsZ0RBQW1EO0FBRW5ELHNFQUF5RTtBQUV6RSxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUE7QUFDdEIsTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFBO0FBQ3JCLHFEQUFxRDtBQUNyRCxNQUFNLGVBQWUsR0FBRyxFQUFFLEdBQUcsTUFBTSxDQUFBO0FBQ25DLHFFQUFxRTtBQUNyRSxNQUFNLFVBQVUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUE7QUFFeEM7Ozs7O0dBS0c7QUFDWSxLQUFLLFVBQVUsbUJBQW1CLENBQUMsU0FBMEI7SUFDMUUsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBdUIsd0JBQWMsQ0FBQyxDQUFBO0lBQ3ZFLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsTUFBTSxDQUFDLENBQUE7SUFFbEUsSUFBSSxDQUFDLENBQUMsTUFBTSxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkQsT0FBTTtJQUNSLENBQUM7SUFFRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7SUFDdEIsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyx5QkFBYyxDQUFDLENBQUMsTUFBTSxDQUNqRCxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyw0QkFBaUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksTUFBTSxLQUFLLHlCQUFjLENBQUMsT0FBTyxD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