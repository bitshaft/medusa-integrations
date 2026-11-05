import type { ApaczkaPollingStatus, ApaczkaWebhookStatus } from "./types"

/**
 * One status vocabulary for the whole plugin.
 *
 * Apaczka uses two different sets: one for polling (`tracking/`) and a richer
 * one for push webhooks. They must not share a mapping (the docs warn about
 * this; e.g. `CANCELED` vs `CANCELLED`, and webhook `SENT` means a COD payout,
 * not "sent"). Both are mapped here onto `ShipmentStatus`.
 */
export const ShipmentStatus = {
  /** Created in Medusa, not yet sent to Apaczka. */
  PENDING: "pending",
  /** Order exists in Apaczka; parcel not with the carrier yet. */
  CREATED: "created",
  /** Handed over to the carrier. */
  POSTED: "posted",
  IN_TRANSIT: "in_transit",
  OUT_FOR_DELIVERY: "out_for_delivery",
  /** Waiting in a parcel locker / pickup point. */
  READY_FOR_PICKUP: "ready_for_pickup",
  DELIVERED: "delivered",
  /** Needs attention: failed delivery attempt, notice left, unknown status. */
  EXCEPTION: "exception",
  RETURNED: "returned",
  CANCELED: "canceled",
  /** Complaint / correction case opened. */
  CLAIMED: "claimed",
  UNKNOWN: "unknown",
} as const

export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus]

const POLLING_MAP: Record<ApaczkaPollingStatus, ShipmentStatus> = {
  NEW: ShipmentStatus.CREATED,
  PICKUP: ShipmentStatus.POSTED,
  IN_TRANSIT: ShipmentStatus.IN_TRANSIT,
  DELIVERED: ShipmentStatus.DELIVERED,
  DELIVERED_NO_SYSTEM: ShipmentStatus.DELIVERED,
  EXCEPTION: ShipmentStatus.EXCEPTION,
  RETURNED_TO_SHIPPER: ShipmentStatus.RETURNED,
  CANCELLED: ShipmentStatus.CANCELED,
  CORRECTION: ShipmentStatus.CLAIMED,
  UNKNOWN: ShipmentStatus.UNKNOWN,
}

const WEBHOOK_MAP: Record<ApaczkaWebhookStatus, ShipmentStatus> = {
  NEW: ShipmentStatus.CREATED,
  READY_TO_SEND: ShipmentStatus.CREATED,
  ADVISING: ShipmentStatus.CREATED,
  POSTED: ShipmentStatus.POSTED,
  ON_THE_WAY: ShipmentStatus.IN_TRANSIT,
  OUT_FOR_DELIVERY: ShipmentStatus.OUT_FOR_DELIVERY,
  READY_TO_PICKUP: ShipmentStatus.READY_FOR_PICKUP,
  DELIVERED: ShipmentStatus.DELIVERED,
  WAITING_FOR_PAYOUT: ShipmentStatus.DELIVERED,
  SENT: ShipmentStatus.DELIVERED,
  AVIZO: ShipmentStatus.EXCEPTION,
  REMINDER_SENT: ShipmentStatus.EXCEPTION,
  OTHER: ShipmentStatus.EXCEPTION,
  UNKNOWN: ShipmentStatus.UNKNOWN,
  PICKUP_EXPIRED: ShipmentStatus.RETURNED,
  RETURNED: ShipmentStatus.RETURNED,
  CANCELED: ShipmentStatus.CANCELED,
  CLAIMED: ShipmentStatus.CLAIMED,
}

export function fromPollingStatus(status: string): ShipmentStatus {
  return POLLING_MAP[status as ApaczkaPollingStatus] ?? ShipmentStatus.UNKNOWN
}

export function fromWebhookStatus(status: string): ShipmentStatus {
  return WEBHOOK_MAP[status as ApaczkaWebhookStatus] ?? ShipmentStatus.UNKNOWN
}

/** Statuses after which nothing else is expected to happen. */
export const TERMINAL_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  ShipmentStatus.DELIVERED,
  ShipmentStatus.RETURNED,
  ShipmentStatus.CANCELED,
])

/** True once the parcel is physically with the carrier. */
export function isShipped(status: ShipmentStatus): boolean {
  return (
    status === ShipmentStatus.POSTED ||
    status === ShipmentStatus.IN_TRANSIT ||
    status === ShipmentStatus.OUT_FOR_DELIVERY ||
    status === ShipmentStatus.READY_FOR_PICKUP ||
    status === ShipmentStatus.DELIVERED ||
    status === ShipmentStatus.EXCEPTION ||
    status === ShipmentStatus.RETURNED
  )
}
