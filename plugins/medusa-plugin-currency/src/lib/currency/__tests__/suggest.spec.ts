import type { ResolvedRate } from "../money"
import { DEFAULT_RULE, type CurrencyRule } from "../settings"
import { type SuggestContext, type Suggestion, suggestPrices } from "../suggest"

const rate = (currency: string, value: string, margin = "0", stale = false) => ({
  ok: true as const,
  rate: {
    currency,
    mode: margin === "0" ? "api" : "api_margin",
    rate: value,
    margin,
    effective: value,
    source: { provider: "nbp", table: "225/A/NBP/2026", date: "2026-11-19", stale },
  } as ResolvedRate,
})

const rule = (extra: Partial<CurrencyRule> = {}): CurrencyRule => ({ ...DEFAULT_RULE, ...extra })

const context = (overrides: Partial<SuggestContext> = {}): SuggestContext => ({
  base: { code: "pln", decimals: 2 },
  currencies: [
    { code: "pln", decimals: 2 },
    { code: "eur", decimals: 2 },
    { code: "usd", decimals: 2 },
  ],
  regions: [
    { id: "reg_pl", name: "Polska", currency: "pln", countries: ["pl"] },
    { id: "reg_eu", name: "Unia", currency: "eur", countries: ["de", "fr"] },
  ],
  baseTaxCountry: "pl",
  taxInclusive: { currency: { pln: true, eur: true, usd: true }, region: {} },
  taxRates: { pl: "23", de: "19", fr: "20" },
  rules: { eur: rule(), usd: rule({ rounding: "x99" }) },
  rates: { eur: rate("eur", "4"), usd: rate("usd", "3.5") },
  ...overrides,
})

const amounts = (suggestions: Suggestion[]) =>
  Object.fromEntries(suggestions.map((s) => [s.slot, s.ok ? s.amount : `!${s.reason}`]))

describe("suggestPrices", () => {
  it("fills every other column from a base price", () => {
    const [row] = suggestPrices(context(), [{ key: "v1", slot: "pln", amount: "100" }])
    expect(row.error).toBeNull()
    expect(amounts(row.suggestions)).toEqual({
      eur: "25.00",
      usd: "28.99",
      reg_pl: "100.00",
      reg_eu: "25.00",
    })
  })

  it("fills the base price and the others from a price typed in another currency", () => {
    const [row] = suggestPrices(context(), [{ key: "v1", slot: "eur", amount: "10" }])
    expect(amounts(row.suggestions)).toEqual({
      pln: "40.00",
      usd: "10.99",
      reg_pl: "40.00",
      // Same currency: the amount stays, no rounding.
      reg_eu: "10.00",
    })
  })

  it("takes the margin back out of a typed price", () => {
    const rules = { eur: rule({ mode: "api_margin", marginPercent: "5" }), usd: rule() }
    const rates = { eur: rate("eur", "4", "5"), usd: rate("usd", "4") }
    const [row] = suggestPrices(context({ rules, rates }), [{ key: "v1", slot: "eur", amount: "10.50" }])
    expect(amounts(row.suggestions)).toMatchObject({ pln: "40.00", usd: "10.00" })
  })

  it("starts from a region price and applies each side's VAT", () => {
    const [row] = suggestPrices(context({ taxInclusive: { currency: { pln: true, eur: true, usd: true }, region: { reg_eu: false } } }), [
      { key: "v1", slot: "reg_pl", amount: "123" },
    ])
    // 123 gross PLN → 100 net PLN → 25 net EUR in the net region.
    expect(amounts(row.suggestions)).toMatchObject({ pln: "123.00", eur: "30.75", reg_eu: "25.00" })
  })

  it("leaves out switched-off currencies and reports missing rates per column", () => {
    const [row] = suggestPrices(
      context({
        rules: { eur: rule({ enabled: false }), usd: rule() },
        rates: { eur: rate("eur", "4"), usd: { ok: false, reason: "rates_unavailable" } },
      }),
      [{ key: "v1", slot: "pln", amount: "100" }]
    )
    expect(amounts(row.suggestions)).toEqual({
      eur: "!disabled",
      usd: "!rates_unavailable",
      reg_pl: "100.00",
      reg_eu: "!disabled",
    })
  })

  it("marks suggestions made with a stale table", () => {
    const [row] = suggestPrices(context({ rates: { eur: rate("eur", "4", "0", true), usd: rate("usd", "3.5") } }), [
      { key: "v1", slot: "eur", amount: "10" },
    ])
    const byslot = Object.fromEntries(row.suggestions.map((s) => [s.slot, s]))
    // EUR prices carry German VAT (19%), PLN prices Polish (23%): converted gross as they are, with a note.
    expect(byslot.pln.ok && byslot.pln.warnings).toEqual(["tax_differs", "stale_rate"])
    expect(byslot.reg_eu.ok && byslot.reg_eu.warnings).toEqual([])
  })

  it("explains a row it cannot start from", () => {
    const rows = suggestPrices(context({ rates: { eur: { ok: false, reason: "rate_missing" }, usd: rate("usd", "3.5") } }), [
      { key: "a", slot: "chf", amount: "10" },
      { key: "b", slot: "pln", amount: "0" },
      { key: "c", slot: "eur", amount: "10" },
    ])
    expect(rows.map((row) => [row.key, row.error, row.suggestions.length])).toEqual([
      ["a", "unknown_slot", 0],
      ["b", "invalid_amount", 0],
      ["c", "rate_missing", 0],
    ])
  })
})
