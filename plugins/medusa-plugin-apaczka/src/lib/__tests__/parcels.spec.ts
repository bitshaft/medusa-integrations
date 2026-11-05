import { buildParcels } from "../parcels"
import { options } from "./fixtures"

const parcel = (overrides = {}) => ({ ...options().parcel, ...overrides })

describe("buildParcels", () => {
  it("sums weights into one parcel (grams by default)", () => {
    const [p, ...rest] = buildParcels({
      items: [
        { quantity: 2, weight: 500 },
        { quantity: 1, weight: 1250 },
      ],
      options: parcel(),
    })
    expect(rest).toHaveLength(0)
    expect(p.weight).toBe(2.25)
    expect([p.dimension1, p.dimension2, p.dimension3]).toEqual([30, 20, 10])
    expect(p.shipment_type_code).toBe("PACZKA")
    expect(p.is_nstd).toBe(0)
  })

  it("uses the item's own dimensions for a single unit", () => {
    const [p] = buildParcels({
      items: [{ quantity: 1, weight: 1, length: 40.2, width: 30, height: 5, title: "Box" }],
      options: parcel({ weightUnit: "kg" }),
    })
    expect([p.dimension1, p.dimension2, p.dimension3]).toEqual([41, 30, 5])
  })

  it("converts millimetres", () => {
    const [p] = buildParcels({
      items: [{ quantity: 1, weight: 100, length: 250, width: 105, height: 9 }],
      options: parcel({ dimensionUnit: "mm" }),
    })
    expect([p.dimension1, p.dimension2, p.dimension3]).toEqual([25, 11, 1])
  })

  it("falls back to the default weight and adds packaging", () => {
    const [p] = buildParcels({
      items: [{ quantity: 1 }],
      options: parcel({ defaultItemWeightKg: 2, packagingWeightKg: 0.3 }),
    })
    expect(p.weight).toBe(2.3)
  })

  it("applies the minimum weight and rounds up", () => {
    expect(buildParcels({ items: [{ quantity: 1, weight: 1 }], options: parcel() })[0].weight).toBe(0.1)
    expect(buildParcels({ items: [{ quantity: 1, weight: 1001 }], options: parcel() })[0].weight).toBe(1.01)
  })

  it("creates one parcel per unit with per_item", () => {
    const parcels = buildParcels({
      items: [
        { quantity: 2, weight: 1000 },
        { quantity: 1, weight: 3000 },
      ],
      options: parcel({ strategy: "per_item" }),
    })
    expect(parcels.map((p) => p.weight)).toEqual([1, 1, 3])
  })

  it("still returns one parcel when there are no items", () => {
    expect(buildParcels({ items: [], options: parcel() })).toHaveLength(1)
  })

  it("marks non-standard parcels and carries content", () => {
    const [p] = buildParcels({ items: [{ quantity: 1 }], options: parcel({ nonStandard: true }), content: "Order #1" })
    expect(p.is_nstd).toBe(1)
    expect(p.content).toBe("Order #1")
  })
})
