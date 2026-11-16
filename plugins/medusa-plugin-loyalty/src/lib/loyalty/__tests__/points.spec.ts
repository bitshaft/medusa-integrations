import { birthdayDue, birthdayIn, birthdayLockedUntil, localDate, parseBirthday } from "../birthday"
import { toCsv } from "../csv"
import { formatDate, formatMoney, formatPoints, pluralPl } from "../format"
import { reasonMessage } from "../messages"
import {
  addMonths,
  earnedPoints,
  expiresAt,
  isExpired,
  keptBase,
  nextTier,
  orderBase,
  pointValue,
  reminderDue,
  returnTarget,
  tierFor,
} from "../points"
import { DEFAULT_SETTINGS, readSettings, settingsSchema } from "../settings"

const plain = (text: string) => text.replace(/ | /g, " ")

describe("earnedPoints: conversion, rounding, multipliers", () => {
  const perZloty = { points: 1, per_amount: 1 }

  it("gives 1 point per 1 zł by default", () => {
    expect(earnedPoints(255, perZloty)).toBe(255)
  })

  it("always rounds down to a whole point", () => {
    expect(earnedPoints(255.99, perZloty)).toBe(255)
    expect(earnedPoints(0.99, perZloty)).toBe(0)
    expect(earnedPoints(99.99, { points: 1, per_amount: 10 })).toBe(9)
  })

  it("is not fooled by floating point noise", () => {
    expect(earnedPoints(0.1 + 0.2, { points: 10, per_amount: 0.3 })).toBe(10)
    expect(earnedPoints(100, { points: 1, per_amount: 1 }, 1.15)).toBe(115)
  })

  it("supports other rates", () => {
    expect(earnedPoints(300, { points: 5, per_amount: 10 })).toBe(150)
    expect(earnedPoints(300, { points: 0.5, per_amount: 1 })).toBe(150)
  })

  it("applies the tier multiplier before rounding", () => {
    expect(earnedPoints(255, perZloty, 1.25)).toBe(318)
    expect(earnedPoints(255, perZloty, 1.5)).toBe(382)
    expect(earnedPoints(255, perZloty, 0)).toBe(0)
  })

  it("never gives points for nothing", () => {
    expect(earnedPoints(0, perZloty)).toBe(0)
    expect(earnedPoints(-50, perZloty)).toBe(0)
    expect(earnedPoints(100, { points: 0, per_amount: 1 })).toBe(0)
  })
})

describe("orderBase", () => {
  const lines = [
    { id: "a", quantity: 2, total: 246, tax_total: 46, is_reward: false },
    { id: "b", quantity: 1, total: 123, tax_total: 23, is_reward: false },
    { id: "gift", quantity: 1, total: 0, tax_total: 0, is_reward: true },
  ]

  it("counts items after discounts, gross or net, and skips gifts", () => {
    expect(orderBase(lines, "gross")).toEqual({
      total: 369,
      lines: [
        { id: "a", quantity: 2, base: 246 },
        { id: "b", quantity: 1, base: 123 },
      ],
    })
    expect(orderBase(lines, "net").total).toBe(300)
  })

  it("ignores empty lines and never goes below zero", () => {
    expect(orderBase([{ id: "x", quantity: 0, total: 10, tax_total: 0, is_reward: false }], "gross").total).toBe(0)
    expect(orderBase([{ id: "x", quantity: 1, total: 5, tax_total: 9, is_reward: false }], "net").total).toBe(0)
  })
})

describe("returnTarget: points taken back for returned units", () => {
  const lines = [
    { id: "a", quantity: 2, base: 200 },
    { id: "b", quantity: 1, base: 100 },
  ]

  it("takes back nothing before a return", () => {
    expect(returnTarget(300, lines, {})).toBe(0)
  })

  it("takes back the share of the returned units, by their value", () => {
    expect(returnTarget(300, lines, { a: 1 })).toBe(100)
    expect(returnTarget(300, lines, { b: 1 })).toBe(100)
    expect(returnTarget(300, lines, { a: 1, b: 1 })).toBe(200)
  })

  it("takes back everything on a full return", () => {
    expect(returnTarget(300, lines, { a: 2, b: 1 })).toBe(300)
    expect(returnTarget(333, lines, { a: 2, b: 1 })).toBe(333)
  })

  it("rounds in the shop's favour: kept points round down", () => {
    // 3 units of 10 zł, 10 points earned: keeping 2 units keeps floor(6.67) = 6 points.
    expect(returnTarget(10, [{ id: "x", quantity: 3, base: 30 }], { x: 1 })).toBe(4)
  })

  it("ignores more returned units than bought, and unknown lines", () => {
    expect(returnTarget(300, lines, { a: 5, zzz: 3 })).toBe(200)
  })

  it("is cumulative, so applying it twice never takes back twice", () => {
    const first = returnTarget(300, lines, { a: 1 })
    const both = returnTarget(300, lines, { a: 1, b: 1 })
    expect(both - first).toBe(100)
  })

  it("keeps the spend of units not returned for tiers", () => {
    expect(keptBase(lines, { a: 1 })).toBe(200)
    expect(keptBase(lines, { a: 2, b: 1 })).toBe(0)
  })

  it("handles orders that earned nothing", () => {
    expect(returnTarget(0, lines, { a: 1 })).toBe(0)
    expect(returnTarget(10, [], {})).toBe(0)
  })
})

describe("tiers", () => {
  const tiers = [
    { id: "gold", name: "Złoto", threshold: 3000, multiplier: 1.5, bonus_points: 200 },
    { id: "bronze", name: "Brąz", threshold: 0, multiplier: 1, bonus_points: 0 },
    { id: "silver", name: "Srebro", threshold: 1000, multiplier: 1.25, bonus_points: 100 },
  ]

  it("picks the highest tier the spend reaches", () => {
    expect(tierFor(0, tiers)?.id).toBe("bronze")
    expect(tierFor(999.99, tiers)?.id).toBe("bronze")
    expect(tierFor(1000, tiers)?.id).toBe("silver")
    expect(tierFor(10_000, tiers)?.id).toBe("gold")
    expect(tierFor(500, [])).toBeNull()
    expect(tierFor(500, [{ ...tiers[0], threshold: 1000 }])).toBeNull()
  })

  it("says how much is missing to the next tier", () => {
    expect(nextTier(400, tiers)).toEqual({ tier: tiers[2], remaining: 600 })
    expect(nextTier(2999.5, tiers)).toEqual({ tier: tiers[0], remaining: 0.5 })
    expect(nextTier(3000, tiers)).toBeNull()
  })
})

describe("expiry", () => {
  const expiry = { enabled: true, months: 12, reminder_days: 30 }
  const last = new Date("2025-11-14T10:00:00Z")

  it("expires points N months after the last activity", () => {
    expect(expiresAt(last, expiry)).toEqual(new Date("2026-11-14T10:00:00Z"))
    expect(isExpired(last, expiry, new Date("2026-11-14T09:59:59Z"))).toBe(false)
    expect(isExpired(last, expiry, new Date("2026-11-14T10:00:00Z"))).toBe(true)
  })

  it("never expires when switched off or nothing happened", () => {
    expect(expiresAt(last, { ...expiry, enabled: false })).toBeNull()
    expect(isExpired(null, expiry, new Date())).toBe(false)
  })

  it("is due for a reminder within the reminder window only", () => {
    expect(reminderDue(last, expiry, new Date("2026-10-14T09:59:59Z"))).toBe(false)
    expect(reminderDue(last, expiry, new Date("2026-10-15T10:00:00Z"))).toBe(true)
    expect(reminderDue(last, expiry, new Date("2026-11-14T10:00:00Z"))).toBe(false)
    expect(reminderDue(last, { ...expiry, reminder_days: 0 }, new Date("2026-11-01T00:00:00Z"))).toBe(false)
  })

  it("adds calendar months and clamps to the month end", () => {
    expect(addMonths(new Date("2026-01-31T12:00:00Z"), 1)).toEqual(new Date("2026-02-28T12:00:00Z"))
    expect(addMonths(new Date("2027-12-31T00:00:00Z"), 2)).toEqual(new Date("2028-02-29T00:00:00Z"))
  })
})

describe("pointValue", () => {
  it("values a point by the cheapest active amount reward", () => {
    expect(
      pointValue([
        { kind: "fixed", value: 20, cost: 500, active: true },
        { kind: "fixed", value: 50, cost: 1000, active: true },
        { kind: "percentage", value: 10, cost: 100, active: true },
        { kind: "fixed", value: 10, cost: 100, active: false },
      ])
    ).toBe(0.04)
    expect(pointValue([{ kind: "gift", value: null, cost: 100, active: true }])).toBeNull()
  })
})

describe("birthday", () => {
  const settings = { enabled: true, points: 100, change_interval_days: 365, min_days_before: 30 }
  const zone = "Europe/Warsaw"

  it("parses dates with or without a year and rejects impossible ones", () => {
    expect(parseBirthday("1990-05-17")).toEqual({ year: 1990, month: 5, day: 17 })
    expect(parseBirthday("--02-29")).toEqual({ year: null, month: 2, day: 29 })
    expect(parseBirthday("1990-02-30")).toBeNull()
    expect(parseBirthday("17.05.1990")).toBeNull()
  })

  it("moves 29 February to the 28th outside leap years", () => {
    expect(birthdayIn(2027, { month: 2, day: 29 })).toBe("2027-02-28")
    expect(birthdayIn(2028, { month: 2, day: 29 })).toBe("2028-02-29")
  })

  it("is due on the birthday in the store's time zone", () => {
    // 23:30 UTC on 16 May is already 17 May in Warsaw.
    expect(localDate(new Date("2026-05-16T23:30:00Z"), zone)).toBe("2026-05-17")
    const set_at = new Date("2026-01-01T00:00:00Z")
    expect(birthdayDue({ birthday: "1990-05-17", set_at }, settings, new Date("2026-05-16T23:30:00Z"), zone)).toEqual({
      due: true,
      year: 2026,
    })
    expect(birthdayDue({ birthday: "1990-05-17", set_at }, settings, new Date("2026-05-18T10:00:00Z"), zone).due).toBe(
      false
    )
  })

  it("needs the date set long enough before, and the action switched on", () => {
    const now = new Date("2026-05-17T10:00:00Z")
    expect(
      birthdayDue({ birthday: "1990-05-17", set_at: new Date("2026-05-10T00:00:00Z") }, settings, now, zone).due
    ).toBe(false)
    expect(
      birthdayDue(
        { birthday: "1990-05-17", set_at: new Date("2026-01-01T00:00:00Z") },
        { ...settings, enabled: false },
        now,
        zone
      ).due
    ).toBe(false)
    expect(birthdayDue({ birthday: null, set_at: null }, settings, now, zone).due).toBe(false)
  })

  it("moving the date by a day after the bonus pays nothing more that year", () => {
    // Date set long ago (no change lock), bonus on 7 June, date changed to the 8th on the same day.
    const bonus = new Date("2026-06-07T06:00:00Z")
    const changed = { birthday: "1990-06-08", set_at: new Date("2026-06-07T12:00:00Z"), last_bonus_at: bonus }
    expect(birthdayDue(changed, settings, new Date("2026-06-08T10:00:00Z"), zone).due).toBe(false)
    // Even without the 30-day rule, the last bonus is too recent.
    expect(birthdayDue(changed, { ...settings, min_days_before: 0 }, new Date("2026-06-08T10:00:00Z"), zone).due).toBe(
      false
    )
    // A year later the new date counts, once.
    expect(birthdayDue(changed, settings, new Date("2027-06-08T10:00:00Z"), zone)).toEqual({ due: true, year: 2027 })
  })

  it("moving the date across New Year does not pay twice within weeks", () => {
    // Bonus on 31 December 2026, date changed to 5 January: 5 January 2027 is a new calendar year, but too soon.
    const moved = {
      birthday: "1990-01-05",
      set_at: new Date("2026-12-01T00:00:00Z"),
      last_bonus_at: new Date("2026-12-31T08:00:00Z"),
    }
    expect(birthdayDue(moved, settings, new Date("2027-01-05T10:00:00Z"), zone).due).toBe(false)
    expect(birthdayDue(moved, settings, new Date("2028-01-05T10:00:00Z"), zone).due).toBe(true)
  })

  it("locks changes for the configured interval", () => {
    const setAt = new Date("2026-01-01T00:00:00Z")
    expect(birthdayLockedUntil(setAt, settings, new Date("2026-06-01T00:00:00Z"))).toEqual(
      new Date("2027-01-01T00:00:00Z")
    )
    expect(birthdayLockedUntil(setAt, settings, new Date("2027-01-02T00:00:00Z"))).toBeNull()
    expect(
      birthdayLockedUntil(setAt, { ...settings, change_interval_days: 0 }, new Date("2026-01-02T00:00:00Z"))
    ).toBeNull()
    expect(birthdayLockedUntil(null, settings, new Date())).toBeNull()
  })
})

describe("settings", () => {
  it("starts with every default filled in", () => {
    expect(DEFAULT_SETTINGS.earn).toEqual({ points: 1, per_amount: 1, base: "gross" })
    expect(DEFAULT_SETTINGS.actions.birthday).toEqual({
      enabled: false,
      points: 100,
      change_interval_days: 365,
      min_days_before: 30,
    })
    expect(DEFAULT_SETTINGS.expiry).toEqual({ enabled: true, months: 12, reminder_days: 30 })
    expect(DEFAULT_SETTINGS.rewards).toEqual({ return_points_on_code_expiry: true, gift_release_days: 14 })
    expect(DEFAULT_SETTINGS.terms_url).toBeNull()
  })

  it("fills inner defaults of partial settings", () => {
    expect(readSettings({ actions: { signup: { enabled: true } } }).actions.signup).toEqual({
      enabled: true,
      points: 50,
    })
  })

  it("refuses duplicate tier ids and thresholds", () => {
    const tier = { id: "a", name: "A", threshold: 0, multiplier: 1 }
    expect(settingsSchema.safeParse({ tiers: { levels: [tier, { ...tier, threshold: 10 }] } }).success).toBe(false)
    expect(settingsSchema.safeParse({ tiers: { levels: [tier, { ...tier, id: "b" }] } }).success).toBe(false)
    expect(settingsSchema.safeParse({ tiers: { levels: [tier, { ...tier, id: "b", threshold: 10 }] } }).success).toBe(
      true
    )
  })

  it("falls back to the defaults when the stored value is unreadable", () => {
    expect(readSettings({ earn: { per_amount: -1 } })).toEqual(DEFAULT_SETTINGS)
  })
})

describe("formatting and messages", () => {
  it("formats money, dates and points per locale", () => {
    expect(plain(formatMoney(255, "pln", "pl"))).toBe("255,00 zł")
    expect(formatDate("2026-11-13T12:00:00Z", "pl")).toBe("13 lis 2026")
    // Polish groups thousands only from five digits: 1255, but 12 555.
    expect(plain(formatPoints(1255, "pl"))).toBe("1255 pkt")
    expect(plain(formatPoints(12555, "pl"))).toBe("12 555 pkt")
    expect(formatPoints(1, "en")).toBe("1 point")
  })

  it("uses Polish plural forms", () => {
    expect([1, 2, 5, 12, 22].map((n) => pluralPl(n, ["punkt", "punkty", "punktów"]))).toEqual([
      "punkt",
      "punkty",
      "punktów",
      "punktów",
      "punkty",
    ])
  })

  it("fills message variables", () => {
    expect(reasonMessage("insufficient_points", "pl", { cost: 500, balance: 120 })).toBe(
      "Masz za mało punktów na tę nagrodę: potrzeba 500, masz 120."
    )
  })

  it("writes Excel-friendly CSV", () => {
    expect(
      toCsv(
        ["Typ", "Punkty"],
        [
          ["=SUM()", -50],
          ["zamówienie; #12", 1.5],
        ]
      )
    ).toBe('﻿Typ;Punkty\r\n\'=SUM();-50\r\n"zamówienie; #12";1,5\r\n')
  })
})
