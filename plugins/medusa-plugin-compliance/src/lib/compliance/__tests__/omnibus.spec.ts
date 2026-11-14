import {
  discountStartIndex,
  lowestPriceBeforeDiscount,
  type PricePoint,
  priceChanged,
  ruleFor,
  seriesKey,
  withTax,
} from "../omnibus"

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000)
const regular = (n: number, amount: number): PricePoint => ({ at: day(n), amount, regular: amount, discounted: false })
const sale = (n: number, amount: number, reg: number, ref = "plist_1"): PricePoint => ({
  at: day(n),
  amount,
  regular: reg,
  discounted: true,
  kind: "price_list",
  ref,
})
const known = (n: number) => ({ at: day(n), known: true })
const snapshot = (n: number) => ({ at: day(n), known: false })

describe("lowestPriceBeforeDiscount", () => {
  it("takes the lowest price of the 30 days before the discount, including the price in effect at the start", () => {
    const history = [regular(0, 120), regular(50, 100), regular(60, 110), regular(70, 130), sale(80, 90, 130)]
    // Period: day 50..80. Day 50 (100) is in effect at the start of the period.
    const result = lowestPriceBeforeDiscount(history, { periodDays: 30, start: snapshot(0) })
    expect(result).toMatchObject({
      discounted: true,
      amount: 90,
      regular: 130,
      lowest: 100,
      history_incomplete: false,
      sold_since: null,
      kind: "price_list",
    })
    expect(result.discount_started_at).toEqual(day(80))
    expect(result.period_start).toEqual(day(50))
  })

  it("ignores prices older than the period", () => {
    const history = [regular(0, 50), regular(40, 100), sale(80, 90, 100)]
    // Day 40 is in effect at day 50, the start of the period; 50 zł from day 0 is too old.
    expect(lowestPriceBeforeDiscount(history, { periodDays: 30, start: snapshot(0) }).lowest).toBe(100)
  })

  it("uses the price in effect at the start of the period even if it was set long before", () => {
    const history = [regular(0, 80), sale(100, 70, 80)]
    expect(lowestPriceBeforeDiscount(history, { periodDays: 30, start: snapshot(0) })).toMatchObject({
      lowest: 80,
      history_incomplete: false,
    })
  })

  it("uses the lowest price since the start of sales for a product sold for less than the period", () => {
    const history = [regular(70, 100), regular(75, 95), sale(80, 80, 95)]
    const result = lowestPriceBeforeDiscount(history, { periodDays: 30, start: known(70) })
    expect(result).toMatchObject({ lowest: 95, history_incomplete: false })
    expect(result.sold_since).toEqual(day(70))
  })

  it("marks the history incomplete when it starts with the installation snapshot inside the period", () => {
    const history = [regular(70, 100), sale(80, 80, 100)]
    const result = lowestPriceBeforeDiscount(history, { periodDays: 30, start: snapshot(70) })
    expect(result).toMatchObject({ lowest: 100, history_incomplete: true, sold_since: null })
  })

  it("marks a discount already running at installation as incomplete, with no lowest price", () => {
    const result = lowestPriceBeforeDiscount([sale(0, 80, 100)], { periodDays: 30, start: snapshot(0) })
    expect(result).toMatchObject({ discounted: true, lowest: null, history_incomplete: true })
  })

  it("has no previous price for a new product launched at a discount", () => {
    const result = lowestPriceBeforeDiscount([sale(5, 80, 100)], { periodDays: 30, start: known(5) })
    expect(result).toMatchObject({ lowest: null, history_incomplete: false })
    expect(result.sold_since).toEqual(day(5))
  })

  it("returns no discount data when the current price is regular", () => {
    const result = lowestPriceBeforeDiscount([regular(0, 100), sale(10, 80, 100), regular(20, 100)], {
      periodDays: 30,
      start: snapshot(0),
    })
    expect(result).toMatchObject({ discounted: false, amount: 100, regular: 100, lowest: null })
  })

  it("treats a further price cut during a sale as a new discount by default", () => {
    const history = [regular(0, 100), sale(40, 90, 100), sale(50, 70, 100)]
    const result = lowestPriceBeforeDiscount(history, { periodDays: 30, start: snapshot(0) })
    expect(result.discount_started_at).toEqual(day(50))
    expect(result.lowest).toBe(90)
  })

  it("keeps the first cut as the reference for gradual discounts when the exception is set", () => {
    const history = [regular(0, 100), sale(40, 90, 100), sale(50, 70, 100)]
    const result = lowestPriceBeforeDiscount(history, { periodDays: 30, start: snapshot(0), rule: "gradual" })
    expect(result.discount_started_at).toEqual(day(40))
    expect(result.lowest).toBe(100)
  })

  it("does not move the reference when a sale price goes up", () => {
    const history = [regular(0, 100), sale(40, 70, 100), sale(50, 80, 100)]
    expect(discountStartIndex(history, null)).toBe(1)
  })

  it("starts a new discount after the price went back to regular", () => {
    const history = [regular(0, 100), sale(10, 60, 100), regular(20, 100), sale(60, 90, 100)]
    const result = lowestPriceBeforeDiscount(history, { periodDays: 30, start: snapshot(0) })
    // Period day 30..60: in effect 100 from day 20. The 60 zł sale ended before the period.
    expect(result).toMatchObject({ lowest: 100 })
    expect(result.discount_started_at).toEqual(day(60))
  })

  it("counts a sale price inside the period", () => {
    const history = [regular(0, 100), sale(40, 60, 100), regular(45, 100), sale(60, 90, 100)]
    expect(lowestPriceBeforeDiscount(history, { periodDays: 30, start: snapshot(0) }).lowest).toBe(60)
  })

  it("honours a different period length", () => {
    const history = [regular(0, 100), regular(60, 120), sale(80, 90, 120)]
    expect(lowestPriceBeforeDiscount(history, { periodDays: 10, start: snapshot(0) }).lowest).toBe(120)
    expect(lowestPriceBeforeDiscount(history, { periodDays: 30, start: snapshot(0) }).lowest).toBe(100)
  })

  it("returns exempt products without a lowest price", () => {
    const result = lowestPriceBeforeDiscount([regular(0, 100), sale(40, 60, 100)], {
      periodDays: 30,
      start: snapshot(0),
      rule: "exempt",
    })
    expect(result).toMatchObject({ exempt: true, discounted: false, lowest: null, amount: 60 })
  })

  it("sorts unsorted input", () => {
    const history = [sale(80, 90, 130), regular(0, 120), regular(60, 110)]
    expect(lowestPriceBeforeDiscount(history, { periodDays: 30, start: snapshot(0) }).lowest).toBe(110)
  })

  it("keeps regions apart: each series has its own lowest price", () => {
    const series = {
      [seriesKey({ variant_id: "v1", region_id: "reg_pl", currency_code: "pln" })]: [
        regular(0, 123),
        sale(40, 99, 123),
      ],
      [seriesKey({ variant_id: "v1", region_id: "reg_eu", currency_code: "eur" })]: [
        regular(0, 30),
        regular(20, 25),
        sale(40, 20, 30),
      ],
    }
    const results = Object.fromEntries(
      Object.entries(series).map(([key, points]) => [
        key,
        lowestPriceBeforeDiscount(points, { periodDays: 30, start: snapshot(0) }).lowest,
      ])
    )
    expect(results).toEqual({ "v1|reg_pl|pln": 123, "v1|reg_eu|eur": 25 })
  })

  it("returns an empty result without history", () => {
    expect(lowestPriceBeforeDiscount([], { periodDays: 30, start: snapshot(0) })).toMatchObject({
      discounted: false,
      amount: null,
    })
  })
})

describe("ruleFor", () => {
  const exceptions = [
    { target: "category" as const, id: "pcat_food", label: "", rule: "exempt" as const, note: "" },
    { target: "category" as const, id: "pcat_shoes", label: "", rule: "gradual" as const, note: "" },
    { target: "product" as const, id: "prod_1", label: "", rule: "gradual" as const, note: "" },
  ]

  it("has no rule by default", () => {
    expect(ruleFor([], "prod_x", ["pcat_x"])).toBeNull()
  })

  it("prefers a product exception over a category one", () => {
    expect(ruleFor(exceptions, "prod_1", ["pcat_food"])).toBe("gradual")
  })

  it("applies category exceptions, exempt before gradual", () => {
    expect(ruleFor(exceptions, "prod_2", ["pcat_shoes", "pcat_food"])).toBe("exempt")
    expect(ruleFor(exceptions, "prod_2", ["pcat_shoes"])).toBe("gradual")
  })
})

describe("priceChanged and withTax", () => {
  it("records only real changes", () => {
    const last = sale(0, 80, 100)
    expect(priceChanged(last, { amount: 80, regular: 100, discounted: true, kind: "price_list", ref: "plist_1" })).toBe(
      false
    )
    expect(priceChanged(last, { amount: 80, regular: 100, discounted: true, kind: "promotion", ref: "promo_1" })).toBe(
      true
    )
    expect(priceChanged(null, { amount: 1, regular: 1, discounted: false })).toBe(true)
  })

  it("adds tax to net prices and keeps gross prices", () => {
    expect(withTax(100, 23, false)).toBe(123)
    expect(withTax(123, 23, true)).toBe(123)
    expect(withTax(9.99, 8, false)).toBe(10.79)
  })
})
