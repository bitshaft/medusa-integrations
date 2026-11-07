import { selectNewEvents } from "../service"

const at = (iso: string) => new Date(iso)

describe("selectNewEvents", () => {
  const webhook = {
    fingerprint: "w1",
    source: "webhook" as const,
    status: "in_transit" as const,
    occurred_at: at("2026-10-06T08:00:00Z"),
  }

  it("skips events already stored", () => {
    expect(selectNewEvents([webhook], [webhook])).toEqual([])
  })

  it("skips repeats within one batch", () => {
    expect(selectNewEvents([webhook, { ...webhook }], [])).toHaveLength(1)
  })

  it("skips the same change reported by the other source", () => {
    const polled = {
      ...webhook,
      fingerprint: "p1",
      source: "polling" as const,
      occurred_at: at("2026-10-06T08:05:00Z"),
    }
    expect(selectNewEvents([polled], [webhook])).toEqual([])
  })

  it("keeps same-status events from the same source (e.g. several sorting centres)", () => {
    const next = { ...webhook, fingerprint: "w2", occurred_at: at("2026-10-06T08:03:00Z") }
    expect(selectNewEvents([next], [webhook])).toHaveLength(1)
  })

  it("keeps the other source's event when it is far apart in time", () => {
    const later = { ...webhook, fingerprint: "p2", source: "polling" as const, occurred_at: at("2026-10-06T12:00:00Z") }
    expect(selectNewEvents([later], [webhook])).toHaveLength(1)
  })

  it("keeps a different status at the same time", () => {
    const delivered = { ...webhook, fingerprint: "p3", source: "polling" as const, status: "delivered" as const }
    expect(selectNewEvents([delivered], [webhook])).toHaveLength(1)
  })
})
