import { computePlan, type PlanData, type PlanPrice, type PlanVariant } from "../fill/plan"
import { DEFAULT_RULE } from "../settings"

const price = (id: string, currency: string, amount: string, extra: Partial<PlanPrice> = {}): PlanPrice => ({
  id,
  currency,
  amount,
  price_list_id: null,
  region_id: null,
  min_quantity: null,
  max_quantity: null,
  other_rules: false,
  ...extra,
})

const variant = (id: string, prices: PlanPrice[], extra: Partial<PlanVariant> = {}): PlanVariant => ({
  id,
  title: id,
  sku: id.toUpperCase(),
  product_id: "prod_1",
  product_title: "Kubek",
  thumbnail: null,
  price_set_id: `pset_${id}`,
  prices,
  ...extra,
})

const eurRate = {
  ok: true as const,
  rate: {
    currency: "eur",
    mode: "api" as const,
    rate: "4",
    margin: "0",
    effective: "4",
    source: { provider: "nbp", table: "225/A/NBP/2026", date: "2026-11-19", stale: false },
  },
}

const data = (overrides: Partial<PlanData> = {}): PlanData => ({
  base: { code: "pln", decimals: 2 },
  baseTaxCountry: "pl",
  targets: [{ code: "eur", decimals: 2, rule: DEFAULT_RULE, rate: eurRate }],
  variants: [],
  regions: [
    { id: "reg_pl", name: "Polska", currency: "pln", countries: ["pl"] },
    { id: "reg_eu", name: "Unia", currency: "eur", countries: ["de", "fr"] },
    { id: "reg_at", name: "Austria", currency: "eur", countries: ["at"] },
  ],
  priceLists: { plist_bf: { title: "Black Friday", status: "active" } },
  taxInclusive: { currency: { pln: true, eur: true }, region: {} },
  taxRates: { pl: "23", de: "19", fr: "20", at: "20" },
  filled: {},
  options: { overwrite: false, priceLists: false, regionPrices: false },
  ...overrides,
})

describe("computePlan", () => {
  it("adds missing prices and skips the rest with a reason", () => {
    const plan = computePlan(
      data({
        variants: [
          variant("v1", [price("p1", "pln", "100")]),
          variant("v2", [price("p2", "pln", "100"), price("p3", "eur", "30")]),
          variant("v3", [price("p4", "pln", "100"), price("p5", "eur", "25.00")]),
          variant("v4", [price("p6", "eur", "10")]),
          variant("v5", [], { price_set_id: null }),
        ],
      })
    )
    expect(plan.rows.map((row) => [row.variant_id, row.action, row.reason, row.new_amount])).toEqual([
      ["v1", "add", null, "25.00"],
      ["v2", "skip", "already_set", "25.00"],
      ["v3", "skip", "same_amount", "25.00"],
      ["v4", "skip", "no_base_price", null],
      ["v5", "skip", "no_price_set", null],
    ])
    expect(plan.counts).toEqual({ add: 1, overwrite: 0, skip: 4 })
    // No tax country chosen: the first country of the currency's first region (Austria, 20 %).
    expect(plan.rows[0]).toMatchObject({
      tax: "gross",
      tax_rates: { base: "23", target: "20" },
      warnings: ["tax_differs"],
    })
  })

  it("overwrites only when asked, and tells filled prices from manual ones", () => {
    const variants = [
      variant("v1", [price("p1", "pln", "100"), price("p2", "eur", "30")]),
      variant("v2", [price("p3", "pln", "100"), price("p4", "eur", "20")]),
    ]
    const filled = {
      p4: {
        amount: "20.00",
        run_id: "curfill_1",
        created_at: "2026-11-01T10:00:00.000Z",
        rate: "5",
        table: "210/A/NBP/2026",
      },
    }
    const plan = computePlan(
      data({ variants, filled, options: { overwrite: true, priceLists: false, regionPrices: false } })
    )
    expect(plan.rows.map((row) => [row.action, row.current?.origin.kind])).toEqual([
      ["overwrite", "manual"],
      ["overwrite", "filled"],
    ])
    expect(plan.rows[1].current?.origin).toEqual({
      kind: "filled",
      run_id: "curfill_1",
      at: "2026-11-01T10:00:00.000Z",
      rate: "5",
      table: "210/A/NBP/2026",
    })
  })

  it("passes on the rate problem of a currency", () => {
    const plan = computePlan(
      data({
        variants: [variant("v1", [price("p1", "pln", "100")])],
        targets: [
          { code: "eur", decimals: 2, rule: DEFAULT_RULE, rate: { ok: false, reason: "rates_unavailable" } },
          { code: "gbp", decimals: 2, rule: DEFAULT_RULE, rate: { ok: false, reason: "rate_missing" } },
        ],
      })
    )
    expect(plan.rows.map((row) => row.reason)).toEqual(["rates_unavailable", "rate_missing"])
  })

  it("needs the VAT rates for net conversion", () => {
    const plan = computePlan(
      data({
        variants: [variant("v1", [price("p1", "pln", "123")])],
        targets: [{ code: "eur", decimals: 2, rule: { ...DEFAULT_RULE, tax: "net", taxCountry: "fr" }, rate: eurRate }],
        taxRates: { pl: "23", de: "19", fr: null, at: "20" },
      })
    )
    expect(plan.rows[0]).toMatchObject({ action: "skip", reason: "tax_rate_missing" })
    // With the rate present: 123 → 100 net → 25 net → 30.00 at FR 20 %.
    const ok = computePlan(
      data({
        variants: [variant("v1", [price("p1", "pln", "123")])],
        targets: [{ code: "eur", decimals: 2, rule: { ...DEFAULT_RULE, tax: "net", taxCountry: "fr" }, rate: eurRate }],
      })
    )
    expect(ok.rows[0]).toMatchObject({ new_amount: "30.00", tax: "net", tax_rates: { base: "23", target: "20" } })
  })

  it("fills price lists from the same list's base price when asked", () => {
    const variants = [
      variant("v1", [
        price("p1", "pln", "100"),
        price("p2", "pln", "80", { price_list_id: "plist_bf" }),
        price("p3", "pln", "70", { price_list_id: "plist_vip", other_rules: true }),
      ]),
    ]
    expect(computePlan(data({ variants })).rows).toHaveLength(1)
    const plan = computePlan(data({ variants, options: { overwrite: false, priceLists: true, regionPrices: false } }))
    expect(plan.rows.map((row) => [row.price_list_title, row.base_amount, row.new_amount])).toEqual([
      [null, "100", "25.00"],
      ["Black Friday", "80", "20.00"],
    ])
  })

  it("fills each region of the target currency from the base region price, per quantity tier", () => {
    const variants = [
      variant("v1", [
        price("p1", "pln", "100"),
        price("p2", "pln", "90", { min_quantity: "10" }),
        price("p3", "pln", "120", { region_id: "reg_pl" }),
        price("p4", "eur", "33", { region_id: "reg_at" }),
      ]),
    ]
    const plan = computePlan(data({ variants, options: { overwrite: false, priceLists: false, regionPrices: true } }))
    expect(
      plan.rows.map((row) => [row.region_name, row.min_quantity, row.base_amount, row.action, row.reason])
    ).toEqual([
      [null, null, "100", "add", null],
      [null, "10", "90", "add", null],
      ["Austria", null, "120", "skip", "already_set"],
      ["Unia", null, "120", "add", null],
    ])
    // Region prices are net unless the region says otherwise… here both are set gross.
    const gross = computePlan(
      data({
        variants,
        taxInclusive: { currency: { pln: true, eur: true }, region: { reg_pl: true, reg_eu: true } },
        targets: [{ code: "eur", decimals: 2, rule: { ...DEFAULT_RULE, tax: "net" }, rate: eurRate }],
        options: { overwrite: false, priceLists: false, regionPrices: true },
      })
    )
    // 120 → 97.56 net → 24.39 → 29.02 at DE 19 % (no country chosen: the EU region's first).
    expect(gross.rows.find((row) => row.region_id === "reg_eu")).toMatchObject({ new_amount: "29.02", tax: "net" })
  })

  it("marks a stale rate and changes its fingerprint with any input", () => {
    const variants = [variant("v1", [price("p1", "pln", "100")])]
    const stale = { ...eurRate, rate: { ...eurRate.rate, source: { ...eurRate.rate.source, stale: true } } }
    const plan = computePlan(
      data({ variants, targets: [{ code: "eur", decimals: 2, rule: DEFAULT_RULE, rate: stale }] })
    )
    expect(plan.rows[0].warnings).toContain("stale_rate")

    const base = computePlan(data({ variants })).fingerprint
    expect(computePlan(data({ variants })).fingerprint).toBe(base)
    expect(computePlan(data({ variants: [variant("v1", [price("p1", "pln", "101")])] })).fingerprint).not.toBe(base)
    const otherRate = { ...eurRate, rate: { ...eurRate.rate, rate: "4.01" } }
    expect(
      computePlan(data({ variants, targets: [{ code: "eur", decimals: 2, rule: DEFAULT_RULE, rate: otherRate }] }))
        .fingerprint
    ).not.toBe(base)
    const otherTable = {
      ...eurRate,
      rate: { ...eurRate.rate, source: { ...eurRate.rate.source, table: "226/A/NBP/2026" } },
    }
    expect(
      computePlan(data({ variants, targets: [{ code: "eur", decimals: 2, rule: DEFAULT_RULE, rate: otherTable }] }))
        .fingerprint
    ).not.toBe(base)
  })
})
