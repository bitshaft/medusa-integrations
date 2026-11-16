import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { NegotiationError } from "../messages"
import { parseOptions } from "../options"
import { type CartRow, cartTaxInclusive, priceBases } from "../server/catalog"

type Row = Record<string, any>

/** A container whose `query.graph` answers from fixed rows per entity. */
const containerWith = (rows: Record<string, Row[]>) =>
  ({
    resolve: (key: string) => {
      if (key !== ContainerRegistrationKeys.QUERY) throw new Error(`unexpected ${key}`)
      return { graph: async ({ entity }: Row) => ({ data: rows[entity] ?? [] }) }
    },
  }) as unknown as MedusaContainer

const cart = (items: Row[]): CartRow => ({
  id: "cart_1",
  customer_id: "cus_1",
  currency_code: "pln",
  region_id: "reg_pl",
  sales_channel_id: null,
  completed_at: null,
  items,
})

describe("net or gross follows the catalog", () => {
  it("has no option for it; an old taxInclusive option is ignored, not an error", () => {
    const parsed = parseOptions({ taxInclusive: false })
    expect(parsed.enabled).toBe(true)
    expect(parsed.enabled && "taxInclusive" in parsed.options).toBe(false)
  })

  it("reads Medusa's tax-inclusive pricing: per currency, plus regions whose own setting differs", async () => {
    const bases = await priceBases(
      containerWith({
        price_preference: [
          { attribute: "currency_code", value: "pln", is_tax_inclusive: true },
          { attribute: "currency_code", value: "eur", is_tax_inclusive: true },
          { attribute: "region_id", value: "reg_b2b", is_tax_inclusive: false },
          // The same as its currency: nothing to point out.
          { attribute: "region_id", value: "reg_pl", is_tax_inclusive: true },
          { attribute: "currency_code", value: "czk", is_tax_inclusive: true },
        ],
        region: [
          { id: "reg_pl", name: "Polska", currency_code: "pln" },
          { id: "reg_b2b", name: "Polska B2B", currency_code: "pln" },
          { id: "reg_us", name: "USA", currency_code: "usd" },
        ],
        store: [
          {
            supported_currencies: [{ currency_code: "pln" }, { currency_code: "eur" }, { currency_code: "usd" }],
          },
        ],
      })
    )
    // No setting anywhere (USD): Medusa prices it net.
    expect(bases.currencies).toEqual({ pln: true, eur: true, usd: false, czk: true })
    // Medusa applies a region's setting only to prices set for that region, so
    // only a region that differs from its currency is worth listing.
    expect(bases.regions).toEqual([{ id: "reg_b2b", name: "Polska B2B", currency_code: "pln", tax_inclusive: false }])
  })

  it("a cart thread takes net or gross from its lines", () => {
    const gross = cart([
      { variant_id: "v1", is_tax_inclusive: true },
      { variant_id: "v2", is_tax_inclusive: true },
    ])
    expect(cartTaxInclusive(gross)).toBe(true)
    expect(cartTaxInclusive(cart([{ variant_id: "v1", is_tax_inclusive: false }]))).toBe(false)
    // Lines without a variant are not negotiated, so they don't count.
    expect(
      cartTaxInclusive(
        cart([
          { variant_id: "v1", is_tax_inclusive: true },
          { variant_id: null, is_tax_inclusive: false },
        ])
      )
    ).toBe(true)
  })

  it("refuses a cart that mixes net and gross lines instead of adding them up", () => {
    const mixed = cart([
      { variant_id: "v1", is_tax_inclusive: true },
      { variant_id: "v2", is_tax_inclusive: false },
    ])
    expect(() => cartTaxInclusive(mixed)).toThrow(NegotiationError)
    try {
      cartTaxInclusive(mixed)
    } catch (error) {
      expect((error as NegotiationError).code).toBe("invalid_input")
    }
  })
})
