import {
  type ApaczkaTrackingEvent,
  fromPollingStatus,
  fromWebhookStatus,
  type PushTrackingNotification,
} from "./client"
import { parseApaczkaTimestamp } from "./time"

/** Same shape as the module's `TrackingEventInput`, kept free of module imports. */
export type NormalizedTrackingEvent = {
  source: "webhook" | "polling"
  status: ReturnType<typeof fromPollingStatus>
  raw_status: string
  description: string | null
  place: string | null
  occurred_at: Date
}

/** Turns a verified push notification into tracking events. */
export function eventsFromWebhook(notification: PushTrackingNotification): NormalizedTrackingEvent[] {
  return (notification.statuses ?? []).flatMap((entry) => {
    const occurredAt = parseApaczkaTimestamp(entry.updatedAt)
    if (!occurredAt) {
      return []
    }
    const operator = entry.trackingOperatorStatuses?.[0]
    return [
      {
        source: "webhook" as const,
        status: fromWebhookStatus(entry.status),
        raw_status: entry.status,
        description: operator?.description ?? null,
        place: operator?.place ?? null,
        occurred_at: occurredAt,
      },
    ]
  })
}

/** Turns the `tracking/` response into tracking events. */
export function eventsFromPolling(events: ApaczkaTrackingEvent[]): NormalizedTrackingEvent[] {
  return events.flatMap((event) => {
    const occurredAt = parseApaczkaTimestamp(event.updated_at)
    if (!occurredAt) {
      return []
    }
    return [
      {
        source: "polling" as const,
        status: fromPollingStatus(event.status),
        raw_status: event.status_original ? `${event.status} (${event.status_original})` : event.status,
        description: event.description ?? null,
        place: event.place ?? null,
        occurred_at: occurredAt,
      },
    ]
  })
}

/** The most recent event, or undefined. */
export function latestEvent<T extends { occurred_at: Date }>(events: T[]): T | undefined {
  return events.reduce<T | undefined>(
    (latest, event) => (!latest || event.occurred_at > latest.occurred_at ? event : latest),
    undefined
  )
}
