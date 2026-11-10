import {
  buildFulfillmentOptions,
  fulfillmentOptionId,
  parseFulfillmentOption,
  resolvePointsType,
} from "../fulfillment-options"
import { options, serviceStructure } from "./fixtures"

describe("fulfillment options", () => {
  it("builds standard, COD and return variants", () => {
    const result = buildFulfillmentOptions(serviceStructure, options())
    // Sorted by supplier and name: "DPD DPD Kurier" < "DPD DPD Max" < "INPOST InPost Paczkomat".
    expect(result.map((o) => o.id)).toEqual([
      "apaczka-21",
      "apaczka-21-cod",
      "apaczka-21-return",
      "apaczka-22",
      "apaczka-22-cod",
      "apaczka-22-return",
      "apaczka-41",
      "apaczka-41-cod",
    ])
  })

  it("maps service flags", () => {
    const courier = buildFulfillmentOptions(serviceStructure, options()).find((o) => o.id === "apaczka-21")
    expect(courier).toMatchObject({
      service_id: 21,
      name: "DPD Kurier",
      supplier: "DPD",
      origin: "door",
      destination: "door",
      domestic: true,
      pickup_courier: 1,
      points_type: "DPD",
    })

    const locker = buildFulfillmentOptions(serviceStructure, options()).find((o) => o.id === "apaczka-41")!
    expect(locker).toMatchObject({ origin: "point", destination: "point", pickup_courier: 0, points_type: "INPOST" })

    const international = buildFulfillmentOptions(serviceStructure, options()).find((o) => o.id === "apaczka-22")!
    expect(international).toMatchObject({ domestic: false, pickup_courier: 2 })
  })

  it("respects enabledServices, variant switches and custom names", () => {
    const result = buildFulfillmentOptions(
      serviceStructure,
      options({
        enabledServices: [41],
        offerCodVariants: false,
        services: { "41": { name: "Paczkomat InPost 24/7" } },
      })
    )
    expect(result).toEqual([expect.objectContaining({ id: "apaczka-41", name: "Paczkomat InPost 24/7" })])
  })

  it("marks international services that share a domestic name", () => {
    const international = buildFulfillmentOptions(serviceStructure, options()).find((o) => o.id === "apaczka-22")!
    expect(international.name).toBe("DPD Max (international)")
  })

  it("parses stored option data and rejects foreign data", () => {
    const [option] = buildFulfillmentOptions(serviceStructure, options())
    expect(parseFulfillmentOption(JSON.parse(JSON.stringify(option)))).toEqual(option)
    expect(parseFulfillmentOption({ id: "manual-fulfillment" })).toBeUndefined()
    expect(parseFulfillmentOption(null)).toBeUndefined()
    expect(parseFulfillmentOption({ id: "apaczka-x", service_id: "abc" })).toBeUndefined()
  })

  it("resolves point types", () => {
    expect(resolvePointsType("INPOST", {}, ["INPOST"])).toBe("INPOST")
    expect(resolvePointsType("POCZTA POLSKA", {}, ["POCZTA"])).toBe("POCZTA")
    expect(resolvePointsType("ORLEN", { ORLEN: "PWR" }, [])).toBe("PWR")
    expect(resolvePointsType("GLS", {}, [])).toBe("GLS")
    // Real suppliers from production service_structure
    const real = ["UPS", "INPOST", "POCZTA", "DHL_PARCEL", "DPD", "PWR", "CBL", "PACKETA", "DHL_INT", "GLS"]
    expect(resolvePointsType("PP_PACKETA", {}, real)).toBe("PACKETA")
    expect(resolvePointsType("DHL", {}, real)).toBe("DHL_PARCEL")
    expect(resolvePointsType("PWR", {}, real)).toBe("PWR")
    expect(resolvePointsType("DHL_INT", {}, real)).toBe("DHL_INT")
    expect(resolvePointsType("", {}, [])).toBeUndefined()
  })

  it("builds stable IDs", () => {
    expect(fulfillmentOptionId(41, "standard")).toBe("apaczka-41")
    expect(fulfillmentOptionId(41, "cod")).toBe("apaczka-41-cod")
  })
})
