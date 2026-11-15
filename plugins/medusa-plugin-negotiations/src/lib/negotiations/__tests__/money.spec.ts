import { NegotiationError } from "../messages"
import {
  catalogTotal,
  discountBasisPoints,
  distributeTotal,
  lineTotal,
  minorDigits,
  sumLines,
  toMajor,
  toMinor,
} from "../money"
import { allowedOfferModes, buildOffer, buildTarget, offerMatchesLines } from "../offers"
import { line } from "./fixtures"

describe("minor units", () => {
  it("converts Medusa amounts to grosze on the decimal string, without floating point", () => {
    expect(toMinor(19.99, "pln")).toBe(1999)
    expect(toMinor("2124.98", "pln")).toBe(212498)
    expect(toMinor(0.1 + 0.2, "pln")).toBe(30)
    expect(toMinor("10.005", "pln")).toBe(1001)
    expect(toMinor({ value: "12.3" }, "eur")).toBe(1230)
    expect(toMinor(1500, "jpy")).toBe(1500)
    expect(toMinor("1.2345", "kwd")).toBe(1235)
    expect(toMinor(null, "pln")).toBeNull()
    expect(toMinor("abc", "pln")).toBeNull()
  })

  it("writes grosze as the decimal string Medusa takes", () => {
    expect(toMajor(212498, "pln")).toBe("2124.98")
    expect(toMajor(5, "pln")).toBe("0.05")
    expect(toMajor(0, "pln")).toBe("0.00")
    expect(toMajor(1500, "jpy")).toBe("1500")
    expect(minorDigits("BHD")).toBe(3)
    expect(() => toMajor(1.5, "pln")).toThrow()
  })

  it("multiplies and sums as integers and refuses unsafe results", () => {
    expect(lineTotal(1999, 3)).toBe(5997)
    expect(
      sumLines([
        { unit_price: 100, quantity: 2 },
        { unit_price: 1, quantity: 1 },
      ])
    ).toBe(201)
    expect(() => lineTotal(Number.MAX_SAFE_INTEGER, 2)).toThrow("too large")
    expect(() => lineTotal(10.5, 2)).toThrow()
    expect(catalogTotal([line("a", 2, 1000), line("b", 3, 50)])).toBe(2150)
  })

  it("discount in basis points, rounded half up", () => {
    expect(discountBasisPoints(80_000, 100_000)).toBe(2000)
    expect(discountBasisPoints(2, 3)).toBe(3333)
    expect(discountBasisPoints(1, 3)).toBe(6667)
    expect(discountBasisPoints(110, 100)).toBe(-1000)
    expect(discountBasisPoints(5, 0)).toBeNull()
  })
})

describe("one amount over a cart", () => {
  const lines = [line("cable", 30, 38_900), line("socket", 200, 2_450), line("box", 500, 189)]

  it("never goes above the amount and stays within the smallest line quantity of it", () => {
    for (const requested of [1_620_000, 1_500_000, 1_234_567, 999_999, 7]) {
      const offer = distributeTotal(lines, requested)
      const total = sumLines(offer)
      expect(total).toBeLessThanOrEqual(requested)
      expect(requested - total).toBeLessThan(Math.min(...lines.map((l) => l.quantity)) + 1 + lines.length * 500)
      offer.forEach((o) => expect(Number.isSafeInteger(o.unit_price)).toBe(true))
    }
  })

  it("keeps lines in proportion to their catalog value", () => {
    const [cable, socket, box] = distributeTotal(lines, 1_620_000)
    const ratio = 1_620_000 / (30 * 38_900 + 200 * 2_450 + 500 * 189)
    expect(Math.abs(cable.unit_price - 38_900 * ratio)).toBeLessThanOrEqual(1)
    expect(Math.abs(socket.unit_price - 2_450 * ratio)).toBeLessThanOrEqual(1)
    expect(Math.abs(box.unit_price - 189 * ratio)).toBeLessThanOrEqual(1)
  })

  it("an amount that divides exactly is met exactly", () => {
    const offer = distributeTotal([line("a", 2, 1000), line("b", 2, 1000)], 3000)
    expect(offer.map((o) => o.unit_price)).toEqual([750, 750])
  })

  it("works with amounts far beyond 32 bits", () => {
    const big = [line("x", 1000, 99_999_999), line("y", 7, 12_345)]
    const offer = distributeTotal(big, 90_000_000_000)
    expect(sumLines(offer)).toBeLessThanOrEqual(90_000_000_000)
    expect(90_000_000_000 - sumLines(offer)).toBeLessThan(1008)
  })

  it("spreads evenly when there are no catalog prices", () => {
    expect(distributeTotal([line("a", 1, 0), line("b", 1, 0)], 101).map((o) => o.unit_price)).toEqual([51, 50])
  })
})

describe("offers", () => {
  const product = [line("v1", 10, 10_000)]
  const cart = [line("a", 3, 1000), line("b", 1, 333)]

  it("per unit on a product thread", () => {
    expect(buildOffer(product, { mode: "unit", unit_price: 8_500 })).toEqual({
      mode: "unit",
      lines: [{ variant_id: "v1", quantity: 10, unit_price: 8_500 }],
      total: 85_000,
    })
    expect(buildTarget("product", product, 9_000).total).toBe(90_000)
  })

  it("one amount on a cart records what was typed and what is sent", () => {
    const offer = buildOffer(cart, { mode: "total", total: 3000 })
    expect(offer.total).toBeLessThanOrEqual(3000)
    expect(offer.requested_total).toBe(3000)
    expect(offer.total).toBe(sumLines(offer.lines))
  })

  it("a price per line needs every line exactly once", () => {
    const offer = buildOffer(cart, {
      mode: "lines",
      lines: [
        { variant_id: "b", unit_price: 300 },
        { variant_id: "a", unit_price: 900 },
      ],
    })
    expect(offer.total).toBe(3 * 900 + 300)
    expect(offerMatchesLines(offer, cart)).toBe(true)
    expect(() => buildOffer(cart, { mode: "lines", lines: [{ variant_id: "a", unit_price: 1 }] })).toThrow(
      NegotiationError
    )
    expect(() =>
      buildOffer(cart, {
        mode: "lines",
        lines: [
          { variant_id: "a", unit_price: 1 },
          { variant_id: "a", unit_price: 2 },
        ],
      })
    ).toThrow(NegotiationError)
  })

  it("modes allowed by the settings", () => {
    expect(allowedOfferModes("product", "lines")).toEqual(["unit"])
    expect(allowedOfferModes("cart", "both")).toEqual(["total", "lines"])
    expect(allowedOfferModes("cart", "total")).toEqual(["total"])
    expect(() => buildOffer(cart, { mode: "unit", unit_price: 1 })).toThrow(NegotiationError)
  })

  it("refuses non-integer and negative prices", () => {
    expect(() => buildOffer(product, { mode: "unit", unit_price: 85.5 })).toThrow()
    expect(() => buildOffer(product, { mode: "unit", unit_price: -1 })).toThrow()
  })
})
