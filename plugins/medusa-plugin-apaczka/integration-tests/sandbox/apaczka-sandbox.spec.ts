import { ApaczkaClient, listServices, type ApaczkaOrderInput } from "../../src/lib/apaczka"
import { buildFulfillmentOptions } from "../../src/lib/fulfillment-options"
import { resolveOptions } from "../../src/lib/options"

/**
 * Smoke tests against the real Apaczka sandbox. Skipped unless credentials
 * are set:
 *
 *   APACZKA_SANDBOX_APP_ID=... APACZKA_SANDBOX_APP_SECRET=... npm run test:sandbox
 *
 * Set APACZKA_SANDBOX_WRITE=true to also create (and immediately cancel) an
 * order. Known sandbox gaps: no `tracking/` or `dispatch_code/`, and
 * `points/` may time out.
 */
const appId = process.env.APACZKA_SANDBOX_APP_ID
const appSecret = process.env.APACZKA_SANDBOX_APP_SECRET
const write = process.env.APACZKA_SANDBOX_WRITE === "true"

const describeSandbox = appId && appSecret ? describe : describe.skip

jest.setTimeout(60_000)

describeSandbox("Apaczka sandbox", () => {
  let client: ApaczkaClient

  beforeAll(() => {
    client = new ApaczkaClient({
      appId: appId!,
      appSecret: appSecret!,
      environment: "sandbox",
      userAgent: "medusa-plugin-apaczka/sandbox-tests",
      timeoutMs: 30_000,
    })
  })

  const sender = {
    name: "Bitshaft Test",
    contact_person: "Jan Kowalski",
    email: "test@example.com",
    phone: "500000000",
    line1: "Marszałkowska 1",
    postal_code: "00-001",
    city: "Warszawa",
    country_code: "PL",
  }
  const receiver = {
    name: "Anna Nowak",
    contact_person: "Anna Nowak",
    email: "test@example.com",
    phone: "600000000",
    line1: "Długa 15",
    postal_code: "80-831",
    city: "Gdańsk",
    country_code: "PL",
  }

  let courierServiceId: number | undefined

  it("authenticates and lists services", async () => {
    const structure = await client.getServiceStructure()
    const services = listServices(structure)
    expect(services.length).toBeGreaterThan(0)

    const options = buildFulfillmentOptions(structure, resolveOptions({ appId, appSecret }))
    const courier = options.find((o) => o.destination === "door" && o.domestic && !o.cod && !o.is_return)
    courierServiceId = courier?.service_id

    // Printed so you can compare the real dictionary with what the plugin derives.
    console.info(
      `[sandbox] ${services.length} services; first: ${JSON.stringify(services[0])}; ` +
        `points_type: ${JSON.stringify(structure.points_type)}`
    )
  })

  it("prices a domestic parcel across services", async () => {
    const order: ApaczkaOrderInput = {
      address: { sender, receiver },
      pickup: { type: "SELF" },
      shipment: [{ shipment_type_code: "PACZKA", dimension1: 30, dimension2: 20, dimension3: 10, weight: 1 }],
    }
    const valuation = await client.valuateOrder(order)
    const prices = Object.values(valuation.price_table ?? {})
    expect(prices.length).toBeGreaterThan(0)
    for (const price of prices) {
      expect(Number.isInteger(Number(price.price_gross))).toBe(true)
    }
  })

  const writeIt = write ? it : it.skip

  writeIt("creates, reads, labels and cancels an order", async () => {
    expect(courierServiceId).toBeDefined()
    const created = await client.sendOrder({
      service_id: courierServiceId,
      address: { sender, receiver },
      pickup: { type: "SELF" },
      shipment: [{ shipment_type_code: "PACZKA", dimension1: 30, dimension2: 20, dimension3: 10, weight: 1 }],
      content: "Medusa plugin sandbox test",
    })
    expect(created.id).toBeGreaterThan(0)

    try {
      const details = await client.getOrder(created.id)
      expect(details.id).toBe(created.id)
      // Dimensions must round-trip; unknown keys are silently dropped by the API.
      expect(details.shipments?.[0]).toMatchObject({ length: 30, width: 20, height: 10 })

      const waybill = await client.getWaybill(created.id)
      expect(waybill.waybill.length).toBeGreaterThan(100)
    } finally {
      await client.cancelOrder(created.id)
    }
  })
})
