import { codShareForShipment, type CodShareInput } from "../cod"

const base: CodShareInput = {
  orderTotal: 300,
  paidTotal: 0,
  currencyCode: "pln",
  exchangeRates: {},
  shipmentItemsValue: 250,
  orderItemsValue: 250,
  isLastShipment: true,
  alreadyScheduledPln: 0,
}

describe("codShareForShipment", () => {
  it("collects the whole unpaid total for a single shipment", () => {
    expect(codShareForShipment(base)).toBe(300)
  })

  it("collects only what is still unpaid", () => {
    expect(codShareForShipment({ ...base, paidTotal: 100 })).toBe(200)
    expect(codShareForShipment({ ...base, paidTotal: 300 })).toBe(0)
    expect(codShareForShipment({ ...base, paidTotal: 400 })).toBe(0)
  })

  it("splits across shipments and the parts add up exactly", () => {
    // Order: items worth 100 + 200, total 333.33 incl. shipping and tax.
    const order = { ...base, orderTotal: 333.33, orderItemsValue: 300 }
    const first = codShareForShipment({ ...order, shipmentItemsValue: 100, isLastShipment: false })
    const second = codShareForShipment({
      ...order,
      shipmentItemsValue: 200,
      isLastShipment: true,
      alreadyScheduledPln: first,
    })
    expect(first).toBe(111.11)
    expect(second).toBe(222.22)
    expect(Math.round((first + second) * 100) / 100).toBe(333.33)
  })

  it("never collects twice when shipments are created out of order", () => {
    const order = { ...base, orderTotal: 300, orderItemsValue: 300 }
    const last = codShareForShipment({
      ...order,
      shipmentItemsValue: 200,
      isLastShipment: true,
      alreadyScheduledPln: 0,
    })
    expect(last).toBe(300)
    // A later partial shipment finds nothing left to collect.
    expect(
      codShareForShipment({ ...order, shipmentItemsValue: 100, isLastShipment: false, alreadyScheduledPln: last })
    ).toBe(0)
  })

  it("converts other currencies to PLN", () => {
    expect(codShareForShipment({ ...base, orderTotal: 100, currencyCode: "eur", exchangeRates: { eur: 0.25 } })).toBe(
      400
    )
  })

  it("explains a missing exchange rate", () => {
    expect(() => codShareForShipment({ ...base, currencyCode: "eur" })).toThrow("pricing.exchangeRates.eur")
  })
})
