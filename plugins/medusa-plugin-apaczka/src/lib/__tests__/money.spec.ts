import { decimalStringToGrosze, exchangeRate, fromGrosze, priceForCustomer, toGrosze } from "../money"
import { options } from "./fixtures"

const pricing = (overrides = {}) => ({ ...options().pricing, ...overrides })
const quote = { price: 1000, price_gross: 1230 }

describe("money", () => {
  it("converts between major units and grosze without float drift", () => {
    expect(toGrosze(12.2)).toBe(1220)
    expect(toGrosze("0.1")).toBe(10)
    expect(toGrosze({ toString: () => "19.99" })).toBe(1999)
    expect(toGrosze(undefined)).toBe(0)
    expect(fromGrosze(1999)).toBe(19.99)
  })

  it("parses Apaczka decimal strings", () => {
    expect(decimalStringToGrosze("12.20")).toBe(1220)
    expect(decimalStringToGrosze("9,92")).toBe(992)
    expect(decimalStringToGrosze("")).toBeNull()
    expect(decimalStringToGrosze("abc")).toBeNull()
  })

  describe("priceForCustomer", () => {
    it("charges the gross price by default", () => {
      expect(priceForCustomer({ quote, currencyCode: "pln", pricing: pricing() })).toBe(12.3)
    })

    it("can charge the net price", () => {
      expect(priceForCustomer({ quote, currencyCode: "pln", pricing: pricing({ basis: "net" }) })).toBe(10)
    })

    it("applies percentage then fixed markup", () => {
      expect(
        priceForCustomer({ quote, currencyCode: "pln", pricing: pricing({ markupPercent: 10, markupFixed: 2 }) })
      ).toBe(15.53)
    })

    it("rounds up to the configured step", () => {
      expect(priceForCustomer({ quote, currencyCode: "pln", pricing: pricing({ roundUpTo: 1 }) })).toBe(13)
      expect(priceForCustomer({ quote, currencyCode: "pln", pricing: pricing({ roundUpTo: 0.5 }) })).toBe(12.5)
      expect(
        priceForCustomer({ quote: { price: 0, price_gross: 1200 }, currencyCode: "pln", pricing: pricing({ roundUpTo: 1 }) })
      ).toBe(12)
    })

    it("is free above the threshold", () => {
      const p = pricing({ freeShippingThreshold: 200 })
      expect(priceForCustomer({ quote, currencyCode: "pln", pricing: p, cartSubtotal: 200 })).toBe(0)
      expect(priceForCustomer({ quote, currencyCode: "pln", pricing: p, cartSubtotal: 199.99 })).toBe(12.3)
    })

    it("never goes below zero", () => {
      expect(priceForCustomer({ quote, currencyCode: "pln", pricing: pricing({ markupFixed: -100 }) })).toBe(0)
    })

    it("converts with configured exchange rates", () => {
      expect(
        priceForCustomer({ quote, currencyCode: "EUR", pricing: pricing({ exchangeRates: { eur: 0.25 } }) })
      ).toBe(3.08)
    })
  })

  it("explains how to fix a missing exchange rate", () => {
    expect(() => exchangeRate("eur", {})).toThrow("pricing.exchangeRates.eur")
    expect(exchangeRate("PLN", {})).toBe(1)
  })
})
