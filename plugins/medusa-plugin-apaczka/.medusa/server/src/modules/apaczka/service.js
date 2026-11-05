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
        // eslint-disable-next-line prefer-rest-params
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
    getClient() {
        return this.client_;
    }
    getCatalog() {
        return this.catalog_;
    }
    getOptions() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9tb2R1bGVzL2FwYWN6a2Evc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDZDQUF3QztBQUd4QyxxREFBeUQ7QUFFekQsK0NBQWlEO0FBRWpELCtDQUFrRDtBQUNsRCwrQ0FBNkU7QUFDN0UsK0NBQTZDO0FBQzdDLGdEQUFtRDtBQUNuRCw0REFBOEQ7QUFhOUQ7OztHQUdHO0FBQ0gsTUFBcUIsb0JBQXFCLFNBQVEsSUFBQSxxQkFBYSxFQUFDO0lBQzlELGVBQWUsRUFBZiwwQkFBZTtJQUNmLG9CQUFvQixFQUFwQixxQ0FBb0I7Q0FDckIsQ0FBQztJQUNtQixPQUFPLENBQVE7SUFDZixRQUFRLENBQXNCO0lBQzlCLE9BQU8sQ0FBZTtJQUN0QixRQUFRLENBQWdCO0lBRTNDLFlBQVksU0FBK0IsRUFBRSxPQUFnQztRQUMzRSw4Q0FBOEM7UUFDOUMsS0FBSyxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUE7UUFDbkIsSUFBSSxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFBO1FBQy9CLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBQSx3QkFBYyxFQUFDLE9BQU8sQ0FBQyxDQUFBO1FBQ3ZDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSx1QkFBYSxDQUFDO1lBQy9CLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUs7WUFDMUIsU0FBUyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUztZQUNsQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXO1lBQ3RDLE9BQU8sRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU87WUFDOUIsU0FBUyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUztZQUNsQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVO1lBQ3BDLFNBQVMsRUFBRSxJQUFBLG1CQUFTLEdBQUU7WUFDdEIsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFNO1NBQ3pCLENBQUMsQ0FBQTtRQUNGLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSx3QkFBYyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDL0MscUJBQXFCLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsR0FBRyxNQUFNO1lBQ3hFLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixHQUFHLE1BQU07WUFDcEQsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFNO1NBQ3pCLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFFRCxTQUFTO1FBQ1AsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFBO0lBQ3JCLENBQUM7SUFFRCxVQUFVO1FBQ1IsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFBO0lBQ3RCLENBQUM7SUFFRCxVQUFVO1FBQ1IsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFBO0lBQ3RCLENBQUM7SUFFRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsb0JBQW9CLENBQUMsVUFBa0IsRUFBRSxNQUE0QjtRQUN6RSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ25CLE9BQU8sRUFBRSxDQUFBO1FBQ1gsQ0FBQztRQUVELE1BQU0sZUFBZSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDN0MsR0FBRyxLQUFLO1lBQ1IsV0FBVyxFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUM7U0FDaEMsQ0FBQyxDQUFDLENBQUE7UUFFSCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FDbkQsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFDbkYsRUFBRSxNQUFNLEVBQUUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUM1QixDQUFBO1FBQ0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUE7UUFFekQsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQTtRQUM5QixNQUFNLEtBQUssR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDN0MsSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO2dCQUNoRSxPQUFPLEtBQUssQ0FBQTtZQUNkLENBQUM7WUFDRCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQTtZQUMzQixPQUFPLElBQUksQ0FBQTtRQUNiLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNsQixPQUFPLEVBQUUsQ0FBQTtRQUNYLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQywyQkFBMkIsQ0FDckMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNwQixNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDcEIsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQ3BCLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVTtZQUM1QixXQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVcsSUFBSSxJQUFJO1lBQ3RDLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSyxJQUFJLElBQUk7WUFDMUIsV0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXO1lBQzlCLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVztZQUM5QixXQUFXLEVBQUUsVUFBVTtTQUN4QixDQUFDLENBQUMsQ0FDSixDQUFBO0lBQ0gsQ0FBQztDQUNGO0FBekZELHVDQXlGQztBQUVELFNBQVMsV0FBVyxDQUFDLEtBQXlCO0lBQzVDLE9BQU8sSUFBQSx3QkFBVSxFQUFDLFFBQVEsQ0FBQztTQUN4QixNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsRUFBRSxLQUFLLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUM1RyxNQUFNLENBQUMsS0FBSyxDQUFDO1NBQ2IsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQTtBQUNqQixDQUFDIn0=