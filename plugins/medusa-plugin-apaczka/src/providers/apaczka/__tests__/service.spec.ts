import { MedusaError } from "@medusajs/framework/utils"

import { ApaczkaApiError, ApaczkaClient } from "../../../lib/apaczka/client"
import { APP_ID, APP_SECRET, serviceStructure } from "../../../lib/apaczka/__tests__/fixtures"
import { ApaczkaFulfillmentProviderService } from "../service"

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }

const location = {
  id: "sloc_1",
  name: "Warehouse",
  address: {
    address_1: "Magazynowa 1",
    city: "Warszawa",
    postal_code: "00-001",
    country_code: "pl",
    phone: "221112233",
  },
}

const shippingAddress = {
  first_name: "Anna",
  last_name: "Nowak",
  address_1: "Długa 15",
  city: "Gdańsk",
  postal_code: "80-831",
  country_code: "pl",
  phone: "600300400",
}

function createProvider(options: Record<string, unknown> = {}) {
  return new ApaczkaFulfillmentProviderService(
    { logger: logger as never },
    {
      appId: APP_ID,
      appSecret: APP_SECRET,
      sender: { email: "shop@example.com", contactPerson: "Jan" },
      ...options,
    }
  )
}

async function optionFor(provider: ApaczkaFulfillmentProviderService, id: string) {
  const options = await provider.getFulfillmentOptions()
  return options.find((o) => o.id === id)! as Record<string, unknown>
}

describe("ApaczkaFulfillmentProviderService", () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.spyOn(ApaczkaClient.prototype, "getServiceStructure").mockResolvedValue(serviceStructure)
  })

  it("stays disabled instead of failing startup when options are missing or invalid", async () => {
    expect(() => ApaczkaFulfillmentProviderService.validateOptions({})).not.toThrow()

    const missing = new ApaczkaFulfillmentProviderService({ logger: logger as never }, {})
    await expect(missing.getFulfillmentOptions()).resolves.toEqual([])
    await expect(missing.cancelFulfillment({ apaczka: { state: "created", order_id: "123" } })).rejects.toThrow(
      "plugin is disabled"
    )

    const invalid = createProvider({ labelFormat: "gif" })
    await expect(invalid.getFulfillmentOptions()).resolves.toEqual([])
    await expect(invalid.cancelFulfillment({ apaczka: { state: "created", order_id: "123" } })).rejects.toThrow(
      "labelFormat"
    )
  })

  it("lists services as fulfillment options", async () => {
    const options = await createProvider().getFulfillmentOptions()
    expect(options.map((o) => o.id)).toContain("apaczka-41")
    expect(await createProvider().validateOption(options[0])).toBe(true)
    expect(await createProvider().validateOption({ id: "other" })).toBe(false)
    expect(await createProvider().canCalculate({ data: options[0] } as never)).toBe(true)
  })

  it("explains connection failures when listing options", async () => {
    jest
      .spyOn(ApaczkaClient.prototype, "getServiceStructure")
      .mockRejectedValue(new ApaczkaApiError(400, "Invalid signature", "service_structure/"))
    await expect(createProvider().getFulfillmentOptions()).rejects.toThrow(
      "Could not load services from Apaczka: Invalid signature"
    )
  })

  describe("validateFulfillmentData", () => {
    it("requires a point for point delivery", async () => {
      const provider = createProvider()
      const option = await optionFor(provider, "apaczka-41")
      await expect(provider.validateFulfillmentData(option, {}, { from_location: location } as never)).rejects.toThrow(
        "data.point_id"
      )
    })

    it("checks the point and stores snapshots", async () => {
      jest.spyOn(ApaczkaClient.prototype, "getPoints").mockResolvedValue([
        {
          type: "INPOST",
          subtype: "parcel_locker",
          name: "WAW01M",
          foreign_address_id: "WAW01M",
          address: {
            line1: "Marszałkowska 1",
            postal_code: "00-624",
            city: "Warszawa",
            country_code: "PL",
            latitude: "52",
            longitude: "21",
          },
        },
      ])
      const provider = createProvider()
      const option = await optionFor(provider, "apaczka-41")
      const data = await provider.validateFulfillmentData(option, { point_id: "WAW01M" }, {
        from_location: location,
        shipping_address: shippingAddress,
      } as never)

      expect(data).toMatchObject({
        point_id: "WAW01M",
        point: { id: "WAW01M", city: "Warszawa" },
        location_id: "sloc_1",
        location: { id: "sloc_1", address: { city: "Warszawa" } },
        apaczka_option: { id: "apaczka-41" },
      })
    })

    it("rejects unknown points and points without COD", async () => {
      jest.spyOn(ApaczkaClient.prototype, "getPoints").mockResolvedValue([
        {
          type: "INPOST",
          subtype: "parcel_locker",
          name: "NOCOD",
          foreign_address_id: "NOCOD",
          option_cod: false,
          address: { line1: "x", postal_code: "00-001", city: "W", country_code: "PL", latitude: "0", longitude: "0" },
        },
      ])
      const provider = createProvider()
      const option = await optionFor(provider, "apaczka-41")
      const cod = await optionFor(provider, "apaczka-41-cod")
      await expect(provider.validateFulfillmentData(option, { point_id: "MISSING" }, {} as never)).rejects.toThrow(
        "not found"
      )
      await expect(provider.validateFulfillmentData(cod, { point_id: "NOCOD" }, {} as never)).rejects.toThrow(
        "cash on delivery"
      )
    })

    it("does not block checkout when the point directory is down", async () => {
      jest.spyOn(ApaczkaClient.prototype, "getPoints").mockRejectedValue(new Error("timeout"))
      const provider = createProvider()
      const option = await optionFor(provider, "apaczka-41")
      await expect(
        provider.validateFulfillmentData(option, { point_id: "WAW01M" }, {} as never)
      ).resolves.toMatchObject({
        point_id: "WAW01M",
      })
    })
  })

  describe("calculatePrice", () => {
    const context = {
      id: "cart_1",
      currency_code: "pln",
      email: "anna@example.com",
      shipping_address: shippingAddress,
      from_location: location,
      items: [{ title: "Kubek", quantity: 2, unit_price: 50, variant: { weight: 400 } }],
    }

    it("prices with Apaczka and applies markup", async () => {
      const valuate = jest
        .spyOn(ApaczkaClient.prototype, "valuateOrder")
        .mockResolvedValue({ price_table: { "21": { price: 1000, price_gross: 1230 } } })
      const provider = createProvider({ pricing: { markupPercent: 10 } })
      const option = await optionFor(provider, "apaczka-21")

      await expect(provider.calculatePrice(option, {}, context as never)).resolves.toEqual({
        calculated_amount: 13.53,
        is_calculated_price_tax_inclusive: true,
      })

      const payload = valuate.mock.calls[0][0]
      expect(payload.address.sender).toMatchObject({ line1: "Magazynowa 1", email: "shop@example.com" })
      expect(payload.address.receiver).toMatchObject({ city: "Gdańsk", email: "anna@example.com" })
      expect(payload.shipment[0].weight).toBe(0.8)
    })

    it("caches identical quotes", async () => {
      const valuate = jest
        .spyOn(ApaczkaClient.prototype, "valuateOrder")
        .mockResolvedValue({ price_table: { "21": { price: 1000, price_gross: 1230 } } })
      const provider = createProvider()
      const option = await optionFor(provider, "apaczka-21")
      await provider.calculatePrice(option, {}, context as never)
      await provider.calculatePrice(option, {}, context as never)
      expect(valuate).toHaveBeenCalledTimes(1)
    })

    it("uses the fallback amount when Apaczka fails", async () => {
      jest.spyOn(ApaczkaClient.prototype, "valuateOrder").mockRejectedValue(new Error("down"))
      const provider = createProvider({ pricing: { fallbackAmount: 19.99 } })
      const option = await optionFor(provider, "apaczka-21")
      await expect(provider.calculatePrice(option, {}, context as never)).resolves.toMatchObject({
        calculated_amount: 19.99,
      })
    })

    it("fails clearly when the service cannot carry the parcel", async () => {
      jest.spyOn(ApaczkaClient.prototype, "valuateOrder").mockResolvedValue({ price_table: {} })
      const provider = createProvider()
      const option = await optionFor(provider, "apaczka-21")
      await expect(provider.calculatePrice(option, {}, context as never)).rejects.toThrow("cannot carry this parcel")
    })

    it("asks for an address before pricing", async () => {
      const provider = createProvider()
      const option = await optionFor(provider, "apaczka-21")
      await expect(
        provider.calculatePrice(option, {}, { ...context, shipping_address: { country_code: "pl" } } as never)
      ).rejects.toThrow("Enter a shipping address")
    })
  })

  describe("createFulfillment", () => {
    const order = {
      id: "order_1",
      display_id: 1001,
      total: 112.3,
      customer: { email: "anna@example.com" },
      items: [{ id: "item_1", title: "Kubek", unit_price: 50, variant: { weight: 400 } }],
    }
    const items = [{ line_item_id: "item_1", title: "Kubek", quantity: 2 }]

    async function shippingData(provider: ApaczkaFulfillmentProviderService, optionId = "apaczka-21") {
      const option = await optionFor(provider, optionId)
      return provider.validateFulfillmentData(option, {}, { from_location: location } as never)
    }

    it("creates the Apaczka order once and returns labels", async () => {
      const send = jest.spyOn(ApaczkaClient.prototype, "sendOrder").mockResolvedValue({
        id: 555,
        service_id: 21,
        service_name: "DPD Classic",
        waybill_number: "W123",
        pickup_number: null,
        tracking_url: "https://track/W123",
        status: "NEW",
        shipments_count: 1,
        supplier: "DPD",
      })
      jest
        .spyOn(ApaczkaClient.prototype, "getOrder")
        .mockResolvedValue({ price: "9.92", price_gross: "12.20" } as never)
      const provider = createProvider()
      const data = await shippingData(provider)

      const result = await provider.createFulfillment(
        data,
        items,
        order as never,
        {
          id: "ful_1",
          location_id: "sloc_1",
          delivery_address: shippingAddress,
        } as never
      )

      expect(send).toHaveBeenCalledTimes(1)
      expect(send.mock.calls[0][0]).toMatchObject({
        service_id: 21,
        content: "Order #1001",
        address: { sender: { line1: "Magazynowa 1" }, receiver: { email: "anna@example.com" } },
      })
      expect(result.labels).toEqual([
        {
          tracking_number: "W123",
          tracking_url: "https://track/W123",
          label_url: "/admin/apaczka/orders/555/documents/waybill",
        },
      ])
      expect(result.data.apaczka).toMatchObject({
        state: "created",
        order_id: 555,
        status: "created",
        price_net: 992,
        price_gross: 1220,
      })
    })

    it("defers in manual mode", async () => {
      const send = jest.spyOn(ApaczkaClient.prototype, "sendOrder")
      const provider = createProvider({ shipmentCreation: "manual" })
      const result = await provider.createFulfillment(
        await shippingData(provider),
        items,
        order as never,
        {
          location_id: "sloc_1",
          delivery_address: shippingAddress,
        } as never
      )
      expect(send).not.toHaveBeenCalled()
      expect(result).toMatchObject({ labels: [], data: { apaczka: { state: "pending", service_id: 21 } } })
    })

    it("hands shipments with a product without a weight to the workflow, which may hold them", async () => {
      const send = jest.spyOn(ApaczkaClient.prototype, "sendOrder")
      const provider = createProvider()
      const noWeight = {
        ...order,
        items: [{ id: "item_1", title: "Kubek", unit_price: 50, variant: { weight: null } }],
      }
      const result = await provider.createFulfillment(
        await shippingData(provider),
        items,
        noWeight as never,
        { location_id: "sloc_1", delivery_address: shippingAddress } as never
      )
      expect(send).not.toHaveBeenCalled()
      expect(result.data.apaczka).toMatchObject({ state: "pending", auto_create: true })
    })

    it("hands COD shipments to the workflow so the amount reflects what is unpaid", async () => {
      const send = jest.spyOn(ApaczkaClient.prototype, "sendOrder")
      const provider = createProvider({ cod: { bankAccount: "PL61109010140000071219812874" } })
      const data = await shippingData(provider, "apaczka-21-cod")
      const result = await provider.createFulfillment(
        data,
        items,
        order as never,
        {
          location_id: "sloc_1",
          delivery_address: shippingAddress,
        } as never
      )
      expect(send).not.toHaveBeenCalled()
      expect(result.data.apaczka).toMatchObject({ state: "pending", cod: true, auto_create: true })
    })

    it("hands the shipment to the workflow when the sender address is unknown", async () => {
      const send = jest.spyOn(ApaczkaClient.prototype, "sendOrder")
      const provider = createProvider()
      const data = await shippingData(provider)
      const result = await provider.createFulfillment(
        data,
        items,
        order as never,
        {
          location_id: "sloc_other",
          delivery_address: shippingAddress,
        } as never
      )
      expect(send).not.toHaveBeenCalled()
      expect(result.data.apaczka).toMatchObject({ state: "pending", auto_create: true })
    })

    it("surfaces Apaczka validation errors", async () => {
      jest
        .spyOn(ApaczkaClient.prototype, "sendOrder")
        .mockRejectedValue(new ApaczkaApiError(422, "Invalid postal code", "order_send/"))
      const provider = createProvider()
      await expect(
        provider.createFulfillment(
          await shippingData(provider),
          items,
          order as never,
          {
            location_id: "sloc_1",
            delivery_address: shippingAddress,
          } as never
        )
      ).rejects.toThrow("Apaczka rejected the shipment: Invalid postal code")
    })
  })

  describe("cancelFulfillment", () => {
    it("cancels the Apaczka order", async () => {
      const cancel = jest.spyOn(ApaczkaClient.prototype, "cancelOrder").mockResolvedValue()
      const result = await createProvider().cancelFulfillment({ apaczka: { state: "created", order_id: 555 } })
      expect(cancel).toHaveBeenCalledWith(555)
      expect(result).toMatchObject({ apaczka: { state: "canceled", status: "canceled" } })
    })

    it("explains why a shipped parcel cannot be canceled", async () => {
      jest
        .spyOn(ApaczkaClient.prototype, "cancelOrder")
        .mockRejectedValue(new ApaczkaApiError(400, "Order in transit", "cancel_order/555/"))
      await expect(
        createProvider().cancelFulfillment({ apaczka: { state: "created", order_id: 555 } })
      ).rejects.toThrow("cannot be canceled")
    })

    it("does nothing for pending shipments", async () => {
      const cancel = jest.spyOn(ApaczkaClient.prototype, "cancelOrder")
      await createProvider().cancelFulfillment({ apaczka: { state: "pending", service_id: 21 } })
      expect(cancel).not.toHaveBeenCalled()
    })
  })

  it("defers return labels to the subscriber", async () => {
    const provider = createProvider()
    const option = await optionFor(provider, "apaczka-21-return")
    const result = await provider.createReturnFulfillment({ shipping_option: { data: option } })
    expect(result.data.apaczka).toMatchObject({ state: "pending", is_return: true })
  })

  it("returns label documents", async () => {
    jest.spyOn(ApaczkaClient.prototype, "getWaybill").mockResolvedValue({ waybill: "QUJD", type: "pdf" })
    const provider = createProvider()
    await expect(provider.retrieveDocuments({ apaczka: { state: "created", order_id: 5 } }, "label")).resolves.toEqual({
      content: "QUJD",
      content_type: "application/pdf",
      file_name: "apaczka-5.pdf",
    })
    await expect(provider.retrieveDocuments({}, "label")).rejects.toThrow("no Apaczka shipment")
    expect(await provider.getFulfillmentDocuments({ apaczka: { state: "created", order_id: 5 } })).toEqual([
      { type: "label", url: "/admin/apaczka/orders/5/documents/waybill" },
    ])
  })
})
