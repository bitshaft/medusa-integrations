import { describeCoupon } from "../describe"
import type { Audience, CouponDraft, CouponKind, Locale } from "../types"
import { draft } from "./fixtures"

// Intl puts a no-break space between the amount and "zł"; compare with plain spaces.
const plain = (text: string) => text.replace(/ | /g, " ")
const say = (d: CouponDraft, locale: Locale, names = {}) => plain(describeCoupon(d, locale, { names }))

describe("describeCoupon: exact sentences", () => {
  it("matches the example from the brief, in Polish and English", () => {
    const d = draft({ starts_at: "2026-10-01T08:00:00Z", ends_at: "2026-11-30T20:00:00Z", usage_limit: 500 })
    expect(say(d, "pl")).toBe(
      "15% rabatu na całe zamówienie, z kodem JESIEN15, od 1 paź 2026 do 30 lis 2026, dla wszystkich, do 500 użyć łącznie."
    )
    expect(say(d, "en")).toBe(
      "15% off the whole order, with code JESIEN15, from 1 Oct 2026 to 30 Nov 2026, for everyone, up to 500 uses in total."
    )
  })

  it("describes a fixed discount with groups and a minimum basket", () => {
    const d = draft({
      kind: "fixed",
      value: 50,
      code: "PIERWSZE50",
      audience: "groups",
      audience_ids: ["g1", "g2"],
      min_subtotal: 500,
    })
    expect(say(d, "pl", { groups: { g1: "B2B Standard", g2: "B2B Premium" } })).toBe(
      "50,00 zł rabatu od zamówienia, z kodem PIERWSZE50, bez terminu ważności, dla grup: B2B Standard i B2B Premium, koszyk od 500,00 zł brutto."
    )
    expect(say(d, "en", { groups: { g1: "B2B Standard", g2: "B2B Premium" } })).toBe(
      "PLN 50.00 off the order, with code PIERWSZE50, with no end date, for groups: B2B Standard and B2B Premium, basket from PLN 500.00 gross."
    )
  })

  it("describes automatic free shipping", () => {
    const d = draft({ kind: "free_shipping", value: null, code: null, automatic: true, min_subtotal: 300 })
    expect(say(d, "pl")).toBe(
      "Darmowa dostawa, automatycznie, bez kodu, bez terminu ważności, dla wszystkich, koszyk od 300,00 zł brutto."
    )
  })

  it("describes buy X get Y with product names", () => {
    const d = draft({ kind: "buy_get", value: 100, buy_qty: 3, get_qty: 1, buy_product_ids: ["p1", "p2"] })
    expect(say(d, "pl", { products: { p1: "Smycz", p2: "Kubek" } })).toMatch(/^Kup 3, 1 gratis: Smycz i Kubek, z kodem/)
    expect(say(d, "en", { products: { p1: "Lanyard", p2: "Mug" } })).toMatch(
      /^Buy 3, get 1 free: Lanyard and Mug, with code/
    )
  })

  it("describes a partial buy X get Y discount", () => {
    const d = draft({ kind: "buy_get", value: 50, buy_qty: 2, get_qty: 1, buy_product_ids: ["p1"] })
    expect(say(d, "pl")).toMatch(/^Kup 2, 1 z rabatem 50%: p1,/)
    expect(say(d, "en")).toMatch(/^Buy 2, get 1 at 50% off: p1,/)
  })

  it("describes a category coupon, and falls back when names are unknown", () => {
    const d = draft({ kind: "category", value: 15, category_ids: ["c1"] })
    expect(say(d, "pl", { categories: { c1: "Odzież" } })).toMatch(/^15% rabatu na: Odzież, /)
    expect(say(d, "pl")).toMatch(/^15% rabatu na: c1, /)
    expect(say(draft({ kind: "category", category_ids: [] }), "en")).toMatch(/^15% off: selected categories, /)
  })

  it("describes tiers from the lowest level up, whatever the input order", () => {
    const d = draft({
      tiers: [
        { min: 500, value: 10 },
        { min: 200, value: 5 },
      ],
    })
    expect(say(d, "pl")).toMatch(/^Progi rabatu: 5% od 200,00 zł, 10% od 500,00 zł, z kodem/)
    expect(
      say(
        draft({
          kind: "fixed",
          tiers: [
            { min: 200, value: 20 },
            { min: 500, value: 60 },
          ],
        }),
        "en"
      )
    ).toMatch(/^Discount tiers: PLN 20.00 from PLN 200.00, PLN 60.00 from PLN 500.00,/)
  })

  it("adds first order, per-customer limit and exclusivity at the end", () => {
    const d = draft({ first_order_only: true, per_customer_limit: 1, usage_limit: 2, exclusive: true })
    expect(say(d, "pl")).toBe(
      "15% rabatu na całe zamówienie, z kodem JESIEN15, bez terminu ważności, dla wszystkich, tylko pierwsze zamówienie klienta, do 2 użycia łącznie, 1 użycie na klienta, nie łączy się z innymi kuponami."
    )
    expect(say(d, "en")).toBe(
      "15% off the whole order, with code JESIEN15, with no end date, for everyone, first order only, up to 2 uses in total, 1 use per customer, cannot be combined with other coupons."
    )
  })

  it("uses Polish plural forms for limits", () => {
    expect(say(draft({ usage_limit: 1 }), "pl")).toContain("do 1 użycia łącznie")
    expect(say(draft({ usage_limit: 22 }), "pl")).toContain("do 22 użycia łącznie")
    expect(say(draft({ usage_limit: 12 }), "pl")).toContain("do 12 użyć łącznie")
    expect(say(draft({ per_customer_limit: 3 }), "pl")).toContain("3 użycia na klienta")
    expect(say(draft({ per_customer_limit: 5 }), "pl")).toContain("5 użyć na klienta")
    expect(say(draft({ per_customer_limit: 3 }), "en")).toContain("3 uses per customer")
  })

  it("formats decimal percentages per locale", () => {
    expect(say(draft({ value: 12.5 }), "pl")).toMatch(/^12,5% rabatu/)
    expect(say(draft({ value: 12.5 }), "en")).toMatch(/^12.5% off/)
  })

  it("describes selected customers with a count", () => {
    expect(say(draft({ audience: "customers", audience_ids: ["a", "b", "c"] }), "pl")).toContain(
      "dla wybranych klientów (3)"
    )
    expect(say(draft({ audience: "customers", audience_ids: ["a"] }), "en")).toContain("for 1 selected customer")
    expect(say(draft({ audience: "groups", audience_ids: ["g"] }), "en")).toContain("for groups: g")
  })

  it("describes one-sided validity", () => {
    expect(say(draft({ starts_at: "2026-11-13T12:00:00Z" }), "pl")).toContain("od 13 lis 2026,")
    expect(say(draft({ ends_at: "2026-12-13T12:00:00Z" }), "pl")).toContain("do 13 gru 2026,")
    expect(say(draft({ ends_at: "2026-12-13T12:00:00Z" }), "en")).toContain("until 13 Dec 2026,")
  })

  it("uses the store time zone for dates near midnight", () => {
    // 23:30 UTC on 30 Nov is already 1 Dec in Warsaw.
    expect(say(draft({ ends_at: "2026-11-30T23:30:00Z" }), "pl")).toContain("do 1 gru 2026")
  })
})

describe("describeCoupon: every combination", () => {
  const kinds: CouponKind[] = ["percentage", "fixed", "free_shipping", "category", "buy_get"]
  const modes = [
    { automatic: false, code: "KOD10" },
    { automatic: true, code: null },
  ]
  const validities = [
    { starts_at: null, ends_at: null },
    { starts_at: "2026-10-01T10:00:00Z", ends_at: null },
    { starts_at: null, ends_at: "2026-11-30T10:00:00Z" },
    { starts_at: "2026-10-01T10:00:00Z", ends_at: "2026-11-30T10:00:00Z" },
  ]
  const audiences: Array<{ audience: Audience; audience_ids: string[] }> = [
    { audience: "all", audience_ids: [] },
    { audience: "groups", audience_ids: ["g1"] },
    { audience: "customers", audience_ids: ["c1", "c2"] },
  ]
  const flagSets = [
    {},
    { first_order_only: true },
    { exclusive: true },
    { min_subtotal: 300 },
    { usage_limit: 100 },
    { per_customer_limit: 2 },
    { first_order_only: true, exclusive: true, min_subtotal: 300, usage_limit: 100, per_customer_limit: 2 },
  ]
  const tierSets = [
    null,
    [
      { min: 200, value: 5 },
      { min: 500, value: 10 },
    ],
  ]

  const cases: Array<[string, CouponDraft]> = []
  for (const kind of kinds)
    for (const mode of modes)
      for (const validity of validities)
        for (const who of audiences)
          for (const flags of flagSets)
            for (const tiers of kind === "percentage" || kind === "fixed" ? tierSets : [null]) {
              const d = draft({
                kind,
                value: kind === "free_shipping" ? null : kind === "buy_get" ? 100 : 10,
                category_ids: kind === "category" ? ["cat"] : [],
                buy_qty: kind === "buy_get" ? 3 : null,
                get_qty: kind === "buy_get" ? 1 : null,
                buy_product_ids: kind === "buy_get" ? ["prod"] : [],
                tiers,
                ...mode,
                ...validity,
                ...who,
                ...flags,
              })
              cases.push([
                `${kind}/${mode.automatic ? "auto" : "code"}/${JSON.stringify(validity)}/${who.audience}/${JSON.stringify(flags)}/${tiers ? "tiers" : "flat"}`,
                d,
              ])
            }

  it("covers the full matrix", () => {
    // 3 kinds without tiers x 2 modes x 4 validities x 3 audiences x 7 flag sets, plus 2 kinds x 2 tier variants.
    expect(cases.length).toBe((3 + 2 * 2) * 2 * 4 * 3 * 7)
  })

  it.each(cases)("%s", (_name, d) => {
    for (const locale of ["pl", "en"] as Locale[]) {
      const text = say(d, locale)
      // One sentence: starts with a capital letter or digit, ends with a single full stop.
      expect(text).toMatch(/^[A-Z0-9ŁŚŻŹĆ]/)
      expect(text.endsWith(".")).toBe(true)
      expect(text.endsWith("..")).toBe(false)
      expect(text).not.toMatch(/undefined|null|NaN/)

      // Every setting shows up, and nothing that is not set.
      if (d.automatic) expect(text).toContain(locale === "pl" ? "bez kodu" : "no code")
      else expect(text).toContain(d.code!)
      expect(text.includes(locale === "pl" ? "pierwsze zamówienie" : "first order only")).toBe(d.first_order_only)
      expect(text.includes(locale === "pl" ? "nie łączy się" : "cannot be combined")).toBe(d.exclusive)
      expect(text.includes(locale === "pl" ? "łącznie" : "in total")).toBe(d.usage_limit != null)
      expect(text.includes(locale === "pl" ? "na klienta" : "per customer")).toBe(d.per_customer_limit != null)
      expect(text.includes(locale === "pl" ? "koszyk od" : "basket from")).toBe(d.min_subtotal != null)
      expect(text.includes(locale === "pl" ? "Progi rabatu" : "Discount tiers")).toBe(d.tiers != null)
      if (!d.starts_at && !d.ends_at) expect(text).toContain(locale === "pl" ? "bez terminu" : "no end date")
      if (d.audience === "all") expect(text).toContain(locale === "pl" ? "dla wszystkich" : "for everyone")
    }
  })
})
