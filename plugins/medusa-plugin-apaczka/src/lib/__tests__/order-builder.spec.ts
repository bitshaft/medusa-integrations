import type { ApaczkaAddress } from "../apaczka"
import { buildFulfillmentOptions, type ApaczkaFulfillmentOption } from "../fulfillment-options"
import { buildOrderPayload, renderTemplate, type BuildOrderInput } from "../order-builder"
import { options, serviceStructure } from "./fixtures"

const warehouse: ApaczkaAddress = {
  name: "Sklep",
  line1: "Magazynowa 1",
  postal_code: "00-001",
  city: "Warszawa",
  country_code: "PL",
  email: "shop@example.com",
}
const customer: ApaczkaAddress = {
  name: "Anna Nowak",
  line1: "Długa 15",
  postal_code: "80-831",
  city: "Gdańsk",
  country_code: "PL",
}

const all = buildFulfillmentOptions(serviceStructure, options())
const option = (id: string): ApaczkaFulfillmentOption => all.find((o) => o.id === id)!

function input(overrides: Partial<BuildOrderInput> = {}): BuildOrderInput {
  return {
    options: options(),
    option: option("apaczka-21"),
    purpose: "shipment",
    warehouse,
    customer,
    items: [{ title: "Kubek", quantity: 2, weight: 400 }],
    itemsValue: 100,
    codAmount: 120,
    displayId: 1001,
    ...overrides,
  }
}

describe("buildOrderPayload", () => {
  it("builds a standard courier order", async () => {
    const order = await buildOrderPayload(input())
    expect(order).toMatchObject({
      service_id: 21,
      address: { sender: warehouse, receiver: customer },
      pickup: { type: "SELF" },
      content: "Order #1001",
      shipment: [expect.objectContaining({ weight: 0.8, dimension1: 30 })],
    })
    expect(order.cod).toBeUndefined()
    expect(order.shipment_value).toBeUndefined()
    expect(order.is_zebra).toBeUndefined()
    expect(order.push_tracking_url).toBeUndefined()
  })

  it("swaps sender and receiver for returns", async () => {
    const order = await buildOrderPayload(input({ option: option("apaczka-21-return") }))
    expect(order.address.sender).toEqual(customer)
    expect(order.address.receiver).toEqual(warehouse)
  })

  it("requires a point for point delivery", async () => {
    await expect(buildOrderPayload(input({ option: option("apaczka-41") }))).rejects.toThrow("no point was chosen")
    const order = await buildOrderPayload(input({ option: option("apaczka-41"), overrides: { point_id: "WAW01M" } }))
    expect(order.address.receiver.foreign_address_id).toBe("WAW01M")
  })

  it("does not require a point just to price", async () => {
    await expect(
      buildOrderPayload(input({ option: option("apaczka-41"), purpose: "valuation" }))
    ).resolves.toBeDefined()
  })

  it("adds COD in grosze and declares at least the COD value", async () => {
    const order = await buildOrderPayload(
      input({
        option: option("apaczka-21-cod"),
        options: options({ cod: { bankAccount: "PL61 1090 1014 0000 0712 1981 2874" } }),
      })
    )
    expect(order.cod).toEqual({ amount: 12000, bankaccount: "PL61109010140000071219812874" })
    expect(order.shipment_value).toBe(12000)
  })

  it("refuses COD without a payout account", async () => {
    await expect(buildOrderPayload(input({ option: option("apaczka-21-cod") }))).rejects.toThrow("cod.bankAccount")
  })

  it("lets staff turn COD off", async () => {
    const order = await buildOrderPayload(input({ option: option("apaczka-21-cod"), overrides: { cod_amount: 0 } }))
    expect(order.cod).toBeUndefined()
  })

  it("declares the items' value with insurance: order_total", async () => {
    const order = await buildOrderPayload(input({ options: options({ insurance: { mode: "order_total" } }) }))
    expect(order.shipment_value).toBe(10000)
  })

  it("applies label format, notifications, webhook URL and additional services", async () => {
    const order = await buildOrderPayload(
      input({
        options: options({
          labelFormat: "zpl",
          webhooks: { backendUrl: "https://api.shop.pl/" },
          defaultOptions: { "31": 1 },
          services: { "21": { options: { "19": true } } },
          notifications: {
            new: { isReceiverEmail: true, isReceiverSms: false, isSenderEmail: false, isSenderSms: false },
          },
        }),
      })
    )
    expect(order.is_zebra).toBe(true)
    expect(order.push_tracking_url).toBe("https://api.shop.pl/hooks/apaczka/tracking")
    expect(order.option).toEqual({ "31": 1, "19": true })
    expect(order.notification?.new?.isReceiverEmail).toBe(true)
  })

  it("does not set a webhook URL for valuations", async () => {
    const order = await buildOrderPayload(
      input({ purpose: "valuation", options: options({ webhooks: { backendUrl: "https://api.shop.pl" } }) })
    )
    expect(order.push_tracking_url).toBeUndefined()
  })

  it("uses staff parcel overrides", async () => {
    const order = await buildOrderPayload(
      input({ overrides: { parcels: [{ weight: 5.123, length: 50.5, width: 40, height: 30, non_standard: true }] } })
    )
    expect(order.shipment).toEqual([
      { shipment_type_code: "PACZKA", dimension1: 51, dimension2: 40, dimension3: 30, weight: 5.13, is_nstd: 1 },
    ])
  })

  it("calls the custom parcel builder and transformOrder hooks", async () => {
    const buildParcels = jest.fn(() => [{ dimension1: 1, dimension2: 2, dimension3: 3, weight: 9 }])
    const transformOrder = jest.fn((order) => ({ ...order, comment: "custom" }))
    const order = await buildOrderPayload(input({ options: options({ buildParcels, transformOrder }) }))
    expect(buildParcels).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 21 }))
    expect(transformOrder).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ purpose: "shipment", isReturn: false })
    )
    expect(order.comment).toBe("custom")
    expect(order.shipment[0].weight).toBe(9)
  })

  it("lets staff switch the service", async () => {
    expect((await buildOrderPayload(input({ overrides: { service_id: 22 } }))).service_id).toBe(22)
  })
})

describe("renderTemplate", () => {
  it("fills placeholders and trims to 255 characters", () => {
    expect(
      renderTemplate("Zamówienie #{display_id}: {items}", {
        displayId: 7,
        items: [
          { title: "Kubek", quantity: 2 },
          { title: "Talerz", quantity: 1 },
        ],
      })
    ).toBe("Zamówienie #7: 2× Kubek, 1× Talerz")
    expect(renderTemplate("x".repeat(300), { items: [] })).toHaveLength(255)
  })

  it("drops a dangling # when there is no display ID", () => {
    expect(renderTemplate("Order #{display_id}", { items: [] })).toBe("Order")
  })
})
