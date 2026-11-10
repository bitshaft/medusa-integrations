import { fromPollingStatus, fromWebhookStatus, isShipped, ShipmentStatus } from "../client/statuses"
import { parseApaczkaTimestamp } from "../time"
import { eventsFromPolling, eventsFromWebhook, latestEvent } from "../tracking"

describe("status mapping", () => {
  it("keeps polling and webhook vocabularies apart", () => {
    expect(fromPollingStatus("CANCELLED")).toBe(ShipmentStatus.CANCELED)
    expect(fromWebhookStatus("CANCELED")).toBe(ShipmentStatus.CANCELED)
    // Webhook SENT is a COD payout, which happens after delivery.
    expect(fromWebhookStatus("SENT")).toBe(ShipmentStatus.DELIVERED)
    expect(fromWebhookStatus("READY_TO_PICKUP")).toBe(ShipmentStatus.READY_FOR_PICKUP)
    expect(fromWebhookStatus("PICKUP_EXPIRED")).toBe(ShipmentStatus.RETURNED)
    expect(fromPollingStatus("DELIVERED_NO_SYSTEM")).toBe(ShipmentStatus.DELIVERED)
  })

  it("maps unknown statuses to unknown", () => {
    expect(fromPollingStatus("SOMETHING_NEW")).toBe(ShipmentStatus.UNKNOWN)
    expect(fromWebhookStatus("SOMETHING_NEW")).toBe(ShipmentStatus.UNKNOWN)
  })

  it("knows when a parcel is with the carrier", () => {
    expect(isShipped(ShipmentStatus.CREATED)).toBe(false)
    expect(isShipped(ShipmentStatus.POSTED)).toBe(true)
    expect(isShipped(ShipmentStatus.DELIVERED)).toBe(true)
    expect(isShipped(ShipmentStatus.CANCELED)).toBe(false)
  })
})

describe("parseApaczkaTimestamp", () => {
  it("reads offset-less timestamps as Europe/Warsaw time", () => {
    // Summer (CEST, UTC+2)
    expect(parseApaczkaTimestamp("2026-07-21T10:15:00")?.toISOString()).toBe("2026-07-21T08:15:00.000Z")
    // Winter (CET, UTC+1)
    expect(parseApaczkaTimestamp("2026-01-15 10:15:00")?.toISOString()).toBe("2026-01-15T09:15:00.000Z")
  })

  it("respects explicit offsets", () => {
    expect(parseApaczkaTimestamp("2026-07-21T08:15:00+00:00")?.toISOString()).toBe("2026-07-21T08:15:00.000Z")
    expect(parseApaczkaTimestamp("2026-07-21T08:15:00Z")?.toISOString()).toBe("2026-07-21T08:15:00.000Z")
  })

  it("returns undefined for garbage", () => {
    expect(parseApaczkaTimestamp("yesterday")).toBeUndefined()
    expect(parseApaczkaTimestamp(undefined)).toBeUndefined()
  })
})

describe("event normalization", () => {
  it("converts webhook notifications", () => {
    const events = eventsFromWebhook({
      orderNumber: "1",
      statuses: [
        {
          status: "ON_THE_WAY",
          updatedAt: "2026-10-06T00:45:00",
          trackingOperatorStatuses: [{ status: "IT", description: "In transit", place: "Warszawa", updatedAt: "x" }],
        },
        { status: "DELIVERED", updatedAt: "not a date" },
      ],
    })
    expect(events).toEqual([
      {
        source: "webhook",
        status: ShipmentStatus.IN_TRANSIT,
        raw_status: "ON_THE_WAY",
        description: "In transit",
        place: "Warszawa",
        occurred_at: new Date("2026-10-05T22:45:00.000Z"),
      },
    ])
  })

  it("converts polling events and keeps the carrier status", () => {
    const [event] = eventsFromPolling([
      {
        status: "PICKUP",
        status_original: "Nadana",
        description: "Parcel posted",
        updated_at: "2026-07-20T16:02:00+00:00",
      },
    ])
    expect(event).toMatchObject({ source: "polling", status: ShipmentStatus.POSTED, raw_status: "PICKUP (Nadana)" })
  })

  it("finds the latest event", () => {
    const a = { occurred_at: new Date("2026-01-01") }
    const b = { occurred_at: new Date("2026-01-02") }
    expect(latestEvent([a, b])).toBe(b)
    expect(latestEvent([])).toBeUndefined()
  })
})
