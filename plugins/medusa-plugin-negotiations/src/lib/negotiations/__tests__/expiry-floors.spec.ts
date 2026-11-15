import {
  acceptedUntil,
  checkOfferDeadline,
  DAY_MS,
  defaultOfferDeadline,
  expiresSoon,
  isStale,
  nextDeadline,
  offerLapsed,
  threadExpiresAt,
} from "../expiry"
import { checkFloors } from "../floors"
import { line } from "./fixtures"

const now = new Date("2026-11-15T12:00:00Z")
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS)
const ahead = (days: number) => new Date(now.getTime() + days * DAY_MS)

describe("expiry", () => {
  it("a thread expires after expiryDays without a move; 0 means never", () => {
    expect(isStale({ status: "open", last_activity_at: ago(14), offer_expires_at: null }, now, 14)).toBe(true)
    expect(isStale({ status: "open", last_activity_at: ago(13.9), offer_expires_at: null }, now, 14)).toBe(false)
    expect(isStale({ status: "countered", last_activity_at: ago(30), offer_expires_at: null }, now, 0)).toBe(false)
    expect(threadExpiresAt(now, 0)).toBeNull()
  })

  it("closed and demo threads never expire", () => {
    expect(isStale({ status: "accepted", last_activity_at: ago(100), offer_expires_at: null }, now, 14)).toBe(false)
    expect(
      isStale({ status: "open", is_demo: true, last_activity_at: ago(100), offer_expires_at: null }, now, 14)
    ).toBe(false)
  })

  it("a counter-offer lapses on its own deadline, only while it is pending", () => {
    expect(offerLapsed({ status: "countered", last_activity_at: now, offer_expires_at: ago(0.01) }, now)).toBe(true)
    expect(offerLapsed({ status: "countered", last_activity_at: now, offer_expires_at: ahead(1) }, now)).toBe(false)
    expect(offerLapsed({ status: "open", last_activity_at: now, offer_expires_at: ago(1) }, now)).toBe(false)
  })

  it("the nearest deadline and the two-day counter", () => {
    const t = { status: "countered" as const, last_activity_at: ago(13), offer_expires_at: ahead(3) }
    expect(nextDeadline(t, 14)?.toISOString()).toBe(ahead(1).toISOString())
    expect(expiresSoon(t, now, 14)).toBe(true)
    expect(expiresSoon({ ...t, last_activity_at: now }, now, 14)).toBe(false)
    expect(expiresSoon({ ...t, last_activity_at: now, offer_expires_at: ahead(1.5) }, now, 14)).toBe(true)
    expect(nextDeadline({ ...t, status: "accepted" }, 14)).toBeNull()
  })

  it("offer deadlines: default term, future only, at most a year", () => {
    expect(defaultOfferDeadline(now, 14)?.toISOString()).toBe(ahead(14).toISOString())
    expect(defaultOfferDeadline(now, 0)).toBeNull()
    expect(checkOfferDeadline(ago(1), now)).toBe("past")
    expect(checkOfferDeadline(ahead(400), now)).toBe("too_far")
    expect(checkOfferDeadline(ahead(30), now)).toBeNull()
    expect(acceptedUntil(now, 7).toISOString()).toBe(ahead(7).toISOString())
  })
})

describe("minimum price", () => {
  const lines = [line("a", 10, 10_000), line("b", 5, 2_000)]

  it("flags lines under their minimum with the difference per unit and per line", () => {
    const check = checkFloors(
      [
        { variant_id: "a", quantity: 10, unit_price: 7_000 },
        { variant_id: "b", quantity: 5, unit_price: 1_900 },
      ],
      lines,
      { a: 7_500, b: 1_500 },
      null
    )
    expect(check.below).toEqual([
      { variant_id: "a", unit_price: 7_000, floor: 7_500, difference_per_unit: 500, difference_total: 5_000 },
    ])
    expect(check.needs_confirmation).toBe(true)
  })

  it("a price at the minimum is fine", () => {
    const check = checkFloors([{ variant_id: "a", quantity: 10, unit_price: 7_500 }], [lines[0]], { a: 7_500 }, null)
    expect(check.needs_confirmation).toBe(false)
  })

  it("the maximum discount setting works on the whole price, rounded up to a grosz", () => {
    // catalog 110 000; 12.5 % off at most → 96 250
    const offer = [
      { variant_id: "a", quantity: 10, unit_price: 8_500 },
      { variant_id: "b", quantity: 5, unit_price: 2_000 },
    ]
    const check = checkFloors(offer, lines, {}, 1250)
    expect(check.max_discount).toEqual({ max_basis_points: 1250, min_total: 96_250, total: 95_000, difference: 1_250 })
    expect(checkFloors(offer, lines, {}, 2000).needs_confirmation).toBe(false)
  })
})
