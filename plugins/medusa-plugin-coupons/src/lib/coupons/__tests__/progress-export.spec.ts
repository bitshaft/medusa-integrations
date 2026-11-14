import { batchCsv, couponsCsv, type ExportRow } from "../export"
import { cartProgress } from "../progress"
import { countRows, rowMatchesFilter } from "../status"

describe("cartProgress", () => {
  const tiered = {
    code: "PROGI",
    kind: "percentage" as const,
    tiers: [
      { min: 500, value: 10 },
      { min: 200, value: 5 },
    ],
    min_subtotal: null,
  }

  it("shows how much is missing to the first tier", () => {
    expect(cartProgress(150, [tiered]).tiers[0]).toEqual({
      code: "PROGI",
      kind: "percentage",
      levels: [
        { min: 200, value: 5, reached: false },
        { min: 500, value: 10, reached: false },
      ],
      current: null,
      next: { min: 200, value: 5, remaining: 50 },
    })
  })

  it("shows the tier reached and the next one", () => {
    const progress = cartProgress(380.5, [tiered]).tiers[0]
    expect(progress.current).toEqual({ min: 200, value: 5 })
    expect(progress.next).toEqual({ min: 500, value: 10, remaining: 119.5 })
  })

  it("has no next tier once the top one is reached", () => {
    const progress = cartProgress(800, [tiered]).tiers[0]
    expect(progress.current).toEqual({ min: 500, value: 10 })
    expect(progress.next).toBeNull()
  })

  it("respects a minimum basket above the first tier", () => {
    const progress = cartProgress(250, [{ ...tiered, min_subtotal: 300 }]).tiers[0]
    expect(progress.current).toBeNull()
    expect(progress.next).toEqual({ min: 200, value: 5, remaining: 50 })
  })

  it("picks the closest free shipping offer", () => {
    const offers = [
      { code: null, kind: "free_shipping" as const, tiers: null, min_subtotal: 300 },
      { code: "DOSTAWA", kind: "free_shipping" as const, tiers: null, min_subtotal: 150 },
    ]
    expect(cartProgress(100, offers).free_shipping).toEqual({
      threshold: 150,
      remaining: 50,
      reached: false,
      code: "DOSTAWA",
    })
    expect(cartProgress(200, offers).free_shipping).toEqual({
      threshold: 150,
      remaining: 0,
      reached: true,
      code: "DOSTAWA",
    })
    expect(cartProgress(200, []).free_shipping).toBeNull()
  })

  it("ignores coupons without tiers", () => {
    expect(cartProgress(100, [{ code: "X", kind: "percentage", tiers: null, min_subtotal: null }]).tiers).toEqual([])
  })
})

describe("list filters", () => {
  const rows = [
    { status: "active" as const, expiring: true, automatic: false },
    { status: "active" as const, expiring: false, automatic: true },
    { status: "paused" as const, expiring: false, automatic: false },
    { status: "ended" as const, expiring: false, automatic: true },
  ]

  it("matches rows and counts every chip", () => {
    expect(rows.filter((r) => rowMatchesFilter(r, "automatic"))).toHaveLength(2)
    expect(countRows(rows)).toEqual({ all: 4, active: 2, scheduled: 0, paused: 1, ended: 1, expiring: 1, automatic: 2 })
  })
})

describe("CSV exports", () => {
  const row: ExportRow = {
    code: "JESIEN15",
    name: "Jesień",
    status: "active",
    automatic: false,
    kind: "percentage",
    sentence: {
      pl: "15% rabatu na całe zamówienie, z kodem JESIEN15.",
      en: "15% off the whole order, with code JESIEN15.",
    },
    used: 3,
    limit: 500,
    per_customer_limit: 1,
    batch_size: null,
    starts_at: "2026-10-01T10:00:00Z",
    ends_at: null,
    created_at: "2026-09-30T10:00:00Z",
    stats: { orders: 3, revenue: 765.5, discount: 135 },
  }

  it("exports coupons with Polish headers and values", () => {
    const lines = couponsCsv(
      [row, { ...row, code: "AUTO-XYZ", automatic: true, status: "paused" }],
      "pl",
      "Europe/Warsaw"
    ).split("\r\n")
    expect(lines[0]).toBe(
      "﻿Kod;Nazwa;Status;Jednym zdaniem;Automatyczny;Użycia;Limit łącznie;Limit na klienta;Kodów w paczce;Zamówienia;Obrót;Rabat;Od;Do;Utworzono"
    )
    expect(lines[1]).toBe(
      "JESIEN15;Jesień;aktywny;15% rabatu na całe zamówienie, z kodem JESIEN15.;nie;3;500;1;;3;765,5;135;1 paź 2026;;30 wrz 2026"
    )
    // Internal codes of automatic coupons are not exported.
    expect(lines[2].startsWith(";Jesień;wstrzymany;")).toBe(true)
  })

  it("exports coupons in English", () => {
    expect(couponsCsv([row], "en", "Europe/Warsaw").split("\r\n")[1]).toContain(
      "active;15% off the whole order, with code JESIEN15.;no;"
    )
  })

  it("exports batch codes with the order that used them", () => {
    const csv = batchCsv(
      [
        { code: "NL-AAAA", used: true, order_display_id: 1042, order_id: "order_1", used_at: "2026-11-02T10:00:00Z" },
        { code: "NL-BBBB", used: false, order_display_id: null, order_id: null, used_at: null },
      ],
      "pl",
      "Europe/Warsaw"
    )
    expect(csv.split("\r\n")).toEqual([
      "﻿Kod;Użyty;Zamówienie;ID zamówienia;Data użycia",
      "NL-AAAA;tak;#1042;order_1;2 lis 2026",
      "NL-BBBB;nie;;;",
      "",
    ])
  })
})
