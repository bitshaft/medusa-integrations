"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventsFromWebhook = eventsFromWebhook;
exports.eventsFromPolling = eventsFromPolling;
exports.latestEvent = latestEvent;
const apaczka_1 = require("./apaczka");
const time_1 = require("./time");
/** Turns a verified push notification into tracking events. */
function eventsFromWebhook(notification) {
    return (notification.statuses ?? []).flatMap((entry) => {
        const occurredAt = (0, time_1.parseApaczkaTimestamp)(entry.updatedAt);
        if (!occurredAt) {
            return [];
        }
        const operator = entry.trackingOperatorStatuses?.[0];
        return [
            {
                source: "webhook",
                status: (0, apaczka_1.fromWebhookStatus)(entry.status),
                raw_status: entry.status,
                description: operator?.description ?? null,
                place: operator?.place ?? null,
                occurred_at: occurredAt,
            },
        ];
    });
}
/** Turns the `tracking/` response into tracking events. */
function eventsFromPolling(events) {
    return events.flatMap((event) => {
        const occurredAt = (0, time_1.parseApaczkaTimestamp)(event.updated_at);
        if (!occurredAt) {
            return [];
        }
        return [
            {
                source: "polling",
                status: (0, apaczka_1.fromPollingStatus)(event.status),
                raw_status: event.status_original ? `${event.status} (${event.status_original})` : event.status,
                description: event.description ?? null,
                place: event.place ?? null,
                occurred_at: occurredAt,
            },
        ];
    });
}
/** The most recent event, or undefined. */
function latestEvent(events) {
    return events.reduce((latest, event) => (!latest || event.occurred_at > latest.occurred_at ? event : latest), undefined);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhY2tpbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvbGliL3RyYWNraW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBbUJBLDhDQWtCQztBQUdELDhDQWlCQztBQUdELGtDQUtDO0FBakVELHVDQUtrQjtBQUNsQixpQ0FBOEM7QUFZOUMsK0RBQStEO0FBQy9ELFNBQWdCLGlCQUFpQixDQUFDLFlBQXNDO0lBQ3RFLE9BQU8sQ0FBQyxZQUFZLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO1FBQ3JELE1BQU0sVUFBVSxHQUFHLElBQUEsNEJBQXFCLEVBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFBO1FBQ3pELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNoQixPQUFPLEVBQUUsQ0FBQTtRQUNYLENBQUM7UUFDRCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUNwRCxPQUFPO1lBQ0w7Z0JBQ0UsTUFBTSxFQUFFLFNBQWtCO2dCQUMxQixNQUFNLEVBQUUsSUFBQSwyQkFBaUIsRUFBQyxLQUFLLENBQUMsTUFBTSxDQUFDO2dCQUN2QyxVQUFVLEVBQUUsS0FBSyxDQUFDLE1BQU07Z0JBQ3hCLFdBQVcsRUFBRSxRQUFRLEVBQUUsV0FBVyxJQUFJLElBQUk7Z0JBQzFDLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxJQUFJLElBQUk7Z0JBQzlCLFdBQVcsRUFBRSxVQUFVO2FBQ3hCO1NBQ0YsQ0FBQTtJQUNILENBQUMsQ0FBQyxDQUFBO0FBQ0osQ0FBQztBQUVELDJEQUEyRDtBQUMzRCxTQUFnQixpQkFBaUIsQ0FBQyxNQUE4QjtJQUM5RCxPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtRQUM5QixNQUFNLFVBQVUsR0FBRyxJQUFBLDRCQUFxQixFQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQTtRQUMxRCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDaEIsT0FBTyxFQUFFLENBQUE7UUFDWCxDQUFDO1FBQ0QsT0FBTztZQUNMO2dCQUNFLE1BQU0sRUFBRSxTQUFrQjtnQkFDMUIsTUFBTSxFQUFFLElBQUEsMkJBQWlCLEVBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztnQkFDdkMsVUFBVSxFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sS0FBSyxLQUFLLENBQUMsZUFBZSxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNO2dCQUMvRixXQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVcsSUFBSSxJQUFJO2dCQUN0QyxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssSUFBSSxJQUFJO2dCQUMxQixXQUFXLEVBQUUsVUFBVTthQUN4QjtTQUNGLENBQUE7SUFDSCxDQUFDLENBQUMsQ0FBQTtBQUNKLENBQUM7QUFFRCwyQ0FBMkM7QUFDM0MsU0FBZ0IsV0FBVyxDQUFrQyxNQUFXO0lBQ3RFLE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FDbEIsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFDdkYsU0FBUyxDQUNWLENBQUE7QUFDSCxDQUFDIn0=