import { convertAmount, effectiveRate, roundPrice } from "../money"

const gross = { inclusive: true, rate: "23" }
const grossDe = { inclusive: true, rate: "19" }

const convert = (overrides: Partial<Parameters<typeof convertAmount>[0]> = {}) =>
  convertAmount({
    amount: "100",
    rate: { rate: "4", margin: "0" },
    decimals: 2,
    rounding: "none",
    tax: "gross",
    base: { inclusive: false, rate: null },
    target: { inclusive: false, rate: null },
    ...overrides,
  })

describe("roundPrice", () => {
  it.each([
    ["none", "23.4567", "23.46"],
    ["none", "23.455", "23.46"],
    ["none", "0.001", "0.01"],
    ["whole", "23.5", "24.00"],
    ["whole", "23.49", "23.00"],
    ["whole", "0.2", "1.00"],
    ["x99", "24.00", "23.99"],
    ["x99", "24.60", "24.99"],
    ["x99", "24.48", "23.99"],
    ["x99", "24.49", "24.99"],
    ["x99", "24.50", "24.99"],
    ["x99", "0.30", "0.99"],
    ["x49_99", "24.30", "24.49"],
    ["x49_99", "24.20", "23.99"],
    ["x49_99", "24.80", "24.99"],
    ["x49_99", "24.10", "23.99"],
    ["x49_99", "24.24", "24.49"],
    ["five", "22.49", "20.00"],
    ["five", "22.50", "25.00"],
    ["five", "1.20", "5.00"],
    ["ten", "24.99", "20.00"],
    ["ten", "25.00", "30.00"],
    ["ten", "3", "10.00"],
  ] as const)("%s rounds %s to %s", (rounding, value, expected) => {
    expect(roundPrice(value, 2, rounding)).toEqual({ amount: expected, fallback: false })
  })

  it("rounds currencies without minor units to whole units", () => {
    expect(roundPrice("1234.5", 0, "none")).toEqual({ amount: "1235", fallback: false })
    expect(roundPrice("1234.5", 0, "x99")).toEqual({ amount: "1235", fallback: true })
    expect(roundPrice("1234.4", 0, "x49_99")).toEqual({ amount: "1234", fallback: true })
  })

  it("keeps three decimals for currencies that have them", () => {
    expect(roundPrice("12.34567", 3, "none").amount).toBe("12.346")
    expect(roundPrice("12.7", 3, "x99").amount).toBe("12.990")
  })
})

describe("convertAmount", () => {
  it("converts at a fixed or API rate 1:1", () => {
    expect(convert()).toMatchObject({ ok: true, amount: "25.00", tax: "none" })
    expect(convert({ amount: "255", rate: { rate: "4.4165", margin: "0" } })).toMatchObject({
      amount: "57.74",
      exact: expect.stringMatching(/^57\.7380/),
    })
  })

  it("adds a positive margin and takes off a negative one", () => {
    expect(convert({ rate: { rate: "4", margin: "3" } })).toMatchObject({ amount: "25.75" })
    expect(convert({ rate: { rate: "4", margin: "-2.5" } })).toMatchObject({ amount: "24.38" })
  })

  it("rounds only at the end", () => {
    // 100 / 3 = 33.333…, then +0.5 % = 33.5; rounding each step would give 33.50 too, but 1/3 is never cut short.
    expect(convert({ rate: { rate: "3", margin: "0.5" } })).toMatchObject({ amount: "33.50", exact: "33.5" })
    expect(convert({ rate: { rate: "3", margin: "0" }, rounding: "x99" })).toMatchObject({ amount: "32.99" })
  })

  it("converts gross to gross as it is, warning when the VAT rates differ", () => {
    const result = convert({ amount: "123", base: gross, target: grossDe })
    expect(result).toEqual({ ok: true, amount: "30.75", exact: "30.75", tax: "gross", warnings: ["tax_differs"] })
    expect(convert({ amount: "123", base: gross, target: gross })).toMatchObject({ warnings: [] })
  })

  it("converts through net: base VAT off, convert, target VAT on", () => {
    // 123 gross PLN → 100 net PLN → 25 net EUR → 29.75 gross EUR at 19 %.
    expect(convert({ amount: "123", base: gross, target: grossDe, tax: "net" })).toMatchObject({
      ok: true,
      amount: "29.75",
      tax: "net",
      warnings: [],
    })
  })

  it("takes VAT off for net target prices and adds it for net base prices", () => {
    expect(convert({ amount: "123", base: gross, target: { inclusive: false, rate: "19" } })).toMatchObject({
      amount: "25.00",
      tax: "strip",
    })
    expect(convert({ amount: "100", base: { inclusive: false, rate: "23" }, target: grossDe })).toMatchObject({
      amount: "29.75",
      tax: "add",
    })
  })

  it("refuses a conversion that needs a VAT rate nobody set", () => {
    expect(convert({ base: { inclusive: true, rate: null }, target: grossDe, tax: "net" })).toEqual({
      ok: false,
      reason: "tax_rate_missing",
    })
    // Gross 1:1 needs no rate.
    expect(convert({ base: { inclusive: true, rate: null }, target: grossDe })).toMatchObject({ ok: true })
  })

  it("reports the rate after margin", () => {
    expect(effectiveRate("4", "0")).toBe("4")
    expect(effectiveRate("4.4", "10")).toBe("4")
    expect(effectiveRate("3", "-25")).toBe("4")
  })
})
