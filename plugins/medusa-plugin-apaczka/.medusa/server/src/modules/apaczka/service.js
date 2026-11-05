"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const utils_1 = require("@medusajs/framework/utils");
const apaczka_1 = require("../../lib/apaczka");
const catalog_1 = require("../../lib/catalog");
const options_1 = require("../../lib/options");
const version_1 = require("../../lib/version");
const shipment_1 = require("./models/shipment");
const tracking_event_1 = require("./models/tracking-event");
/**
 * The plugin's own module: shipment records, tracking history, and the
 * Apaczka client used by workflows, API routes and jobs.
 */
class ApaczkaModuleService extends (0, utils_1.MedusaService)({
    ApaczkaShipment: shipment_1.ApaczkaShipment,
    ApaczkaTrackingEvent: tracking_event_1.ApaczkaTrackingEvent,
}) {
    logger_;
    options_;
    client_;
    catalog_;
    constructor(container, options) {
        super(...arguments);
        this.logger_ = container.logger;
        this.options_ = (0, options_1.resolveOptions)(options);
        this.client_ = new apaczka_1.ApaczkaClient({
            appId: this.options_.appId,
            appSecret: this.options_.appSecret,
            environment: this.options_.environment,
            baseUrl: this.options_.baseUrl,
            timeoutMs: this.options_.timeoutMs,
            maxRetries: this.options_.maxRetries,
            userAgent: (0, version_1.userAgent)(),
            logger: container.logger,
        });
        this.catalog_ = new catalog_1.ApaczkaCatalog(this.client_, {
            serviceStructureTtlMs: this.options_.serviceStructureTtlMinutes * 60_000,
            pointsTtlMs: this.options_.pointsTtlMinutes * 60_000,
            logger: container.logger,
        });
    }
    async getClient() {
        return this.client_;
    }
    async getCatalog() {
        return this.catalog_;
    }
    async getOptions() {
        return this.options_;
    }
    /**
     * Stores tracking events that are not stored yet and returns only the new
     * ones. Safe to call repeatedly with overlapping data.
     */
    async recordTrackingEvents(shipmentId, events) {
        if (!events.length) {
            return [];
        }
        const withFingerprint = events.map((event) => ({
            ...event,
            fingerprint: fingerprint(event),
        }));
        const existing = await this.listApaczkaTrackingEvents({ shipment_id: shipmentId, fingerprint: withFingerprint.map((e) => e.fingerprint) }, { select: ["fingerprint"] });
        const known = new Set(existing.map((e) => e.fingerprint));
        const seen = new Set();
        const fresh = withFingerprint.filter((event) => {
            if (known.has(event.fingerprint) || seen.has(event.fingerprint)) {
                return false;
            }
            seen.add(event.fingerprint);
            return true;
        });
        if (!fresh.length) {
            return [];
        }
        return this.createApaczkaTrackingEvents(fresh.map((event) => ({
            source: event.source,
            status: event.status,
            raw_status: event.raw_status,
            description: event.description ?? null,
            place: event.place ?? null,
            occurred_at: event.occurred_at,
            fingerprint: event.fingerprint,
            shipment_id: shipmentId,
        })));
    }
}
exports.default = ApaczkaModuleService;
function fingerprint(event) {
    return (0, node_crypto_1.createHash)("sha256")
        .update([event.source, event.raw_status, event.occurred_at.toISOString(), event.description ?? ""].join("|"))
        .digest("hex")
        .slice(0, 32);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9tb2R1bGVzL2FwYWN6a2Evc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDZDQUF3QztBQUd4QyxxREFBeUQ7QUFFekQsK0NBQWlEO0FBRWpELCtDQUFrRDtBQUNsRCwrQ0FBNkU7QUFDN0UsK0NBQTZDO0FBQzdDLGdEQUFtRDtBQUNuRCw0REFBOEQ7QUFhOUQ7OztHQUdHO0FBQ0gsTUFBcUIsb0JBQXFCLFNBQVEsSUFBQSxxQkFBYSxFQUFDO0lBQzlELGVBQWUsRUFBZiwwQkFBZTtJQUNmLG9CQUFvQixFQUFwQixxQ0FBb0I7Q0FDckIsQ0FBQztJQUNtQixPQUFPLENBQVE7SUFDZixRQUFRLENBQXNCO0lBQzlCLE9BQU8sQ0FBZTtJQUN0QixRQUFRLENBQWdCO0lBRTNDLFlBQVksU0FBK0IsRUFBRSxPQUFnQztRQUMzRSxLQUFLLENBQUMsR0FBRyxTQUFTLENBQUMsQ0FBQTtRQUNuQixJQUFJLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUE7UUFDL0IsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFBLHdCQUFjLEVBQUMsT0FBTyxDQUFDLENBQUE7UUFDdkMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLHVCQUFhLENBQUM7WUFDL0IsS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSztZQUMxQixTQUFTLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTO1lBQ2xDLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDdEMsT0FBTyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTztZQUM5QixTQUFTLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTO1lBQ2xDLFVBQVUsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVU7WUFDcEMsU0FBUyxFQUFFLElBQUEsbUJBQVMsR0FBRTtZ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