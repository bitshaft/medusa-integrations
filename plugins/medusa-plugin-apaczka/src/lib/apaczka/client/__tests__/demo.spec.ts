import { ApaczkaFulfillmentProviderService } from "../../../../providers/apaczka/service"
import { createApaczkaClient } from "../../client-factory"
import { buildFulfillmentOptions } from "../../fulfillment-options"
import { parseOptions, pluginOptionsSchema } from "../../options"
import { eventsFromPolling } from "../../tracking"
import { listServices } from "../client"
import { DEMO_TIMELINE, DemoApaczkaClient, resetDemoOrders } from "../demo"
import type { ApaczkaOrderInput } from "../types"

const START = Date.parse("2026-11-18T10:00:00.000Z")
const address = { name: "Anna Nowak", line1: "Długa 15", postal_code: "80-831", city: "Gdańsk", country_code: "PL" }
const order = (serviceId: number, extra: Partial<ApaczkaOrderInput> = {}): ApaczkaOrderInput => ({
  service_id: serviceId,
  address: { sender: { ...address, name: "Shop" }, receiver: address },
  shipment: [{ dimension1: 30, dimension2: 20, dimension3: 10, weight: 2.4 }],
  ...extra,
})

function clientAt(start = START) {
  let now = start
  const client = new DemoApaczkaClient({ now: () => now })
  return { client, advance: (minutes: number) => (now += minutes * 60_000) }
}

describe("DemoApaczkaClient", () => {
  beforeEach(resetDemoOrders)

  it("never calls fetch", async () => {
    const fetch = jest.spyOn(globalThis, "fetch")
    const { client } = clientAt()
    await client.getServiceStructure()
    await client.valuateOrder(order(9101))
    const sent = await client.sendOrder(order(9101))
    await client.getWaybill(sent.id)
    await client.getTracking(sent.waybill_number!)
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRestore()
  })

  it("offers services that become fulfillment options, with parcel points", async () => {
    const { client } = clientAt()
    const structure = await client.getServiceStructure()
    expect(listServices(structure).length).toBeGreaterThanOrEqual(4)

    const options = buildFulfillmentOptions(structure, pluginOptionsSchema.parse({ appId: "x", appSecret: "y" }))
    const locker = options.find((option) => option.service_id === 9101 && !option.is_return && !option.cod)
    expect(locker).toMatchObject({ supplier: "INPOST", points_type: "INPOST" })

    const points = await client.getPoints("INPOST")
    expect(points.length).toBeGreaterThan(0)
    expect(points[0]).toMatchObject({ type: "INPOST", address: { country_code: "PL" } })
  })

  it("prices by weight and COD, net and gross", async () => {
    const { client } = clientAt()
    const all = await client.valuateOrder({ ...order(9101), service_id: undefined })
    expect(Object.keys(all.price_table).length).toBeGreaterThanOrEqual(4)

    const plain = (await client.valuateOrder(order(9103))).price_table["9103"]
    const cod = (await client.valuateOrder(order(9103, { cod: { amount: 10000 } }))).price_table["9103"]
    expect(plain.price_gross).toBe(Math.round(plain.price * 1.23))
    expect(cod.price).toBeGreaterThan(plain.price)
  })

  it("creates orders with a waybill, a price and a PDF label", async () => {
    const { client } = clientAt()
    const sent = await client.sendOrder(order(9102))
    expect(sent.waybill_number).toBe(`DEMO${sent.id}`)

    const details = await client.getOrder(sent.id)
    expect(Number(details.price_gross)).toBeGreaterThan(0)
    expect(details.service_name).toBe("InPost Kurier")

    const label = await client.getWaybill(sent.id)
    expect(label.type).toBe("pdf")
    expect(Buffer.from(label.waybill, "base64").toString().startsWith("%PDF-1.4")).toBe(true)

    const zebra = await client.sendOrder(order(9102, { is_zebra: true }))
    const zpl = await client.getWaybill(zebra.id)
    expect(zpl.type).toBe("zpl")
    expect(Buffer.from(zpl.waybill, "base64").toString()).toMatch(/^\^XA/)
  })

  it("moves tracking on with time until delivery", async () => {
    const { client, advance } = clientAt()
    const sent = await client.sendOrder(order(9101))
    const statuses = async () => (await client.getTracking(sent.waybill_number!)).data.map((event) => event.status)

    expect(await statuses()).toEqual(["NEW"])
    advance(6)
    expect((await statuses())[0]).toBe("IN_TRANSIT")
    advance(60)
    const events = (await client.getTracking(sent.waybill_number!)).data
    expect(events[0].status).toBe("DELIVERED")
    expect(eventsFromPolling(events).length).toBeGreaterThanOrEqual(DEMO_TIMELINE.length)
    expect((await client.getOrder(sent.id)).delivered).toBe(events[0].updated_at)
  })

  it("can cancel an order only before the carrier takes it", async () => {
    const { client, advance } = clientAt(START + 3_600_000)
    const first = await client.sendOrder(order(9101))
    await client.cancelOrder(first.id)
    expect((await client.getTracking(first.waybill_number!)).data[0].status).toBe("CANCELLED")

    const second = await client.sendOrder(order(9101))
    advance(3)
    await expect(client.cancelOrder(second.id)).rejects.toThrow(/already taken/)
  })

  it("gives orders made in the same second different IDs, across clients", async () => {
    const one = clientAt().client
    const two = clientAt().client
    const a = await one.sendOrder(order(9101))
    const b = await two.sendOrder(order(9101))
    expect(b.id).toBe(a.id + 1)
    expect((await one.getOrder(b.id)).service_id).toBe(9101)
  })

  it("rebuilds an order it does not know (after a restart) from its ID", async () => {
    const { client } = clientAt()
    const details = await client.getOrder(1234)
    expect(details).toMatchObject({ id: 1234, waybill_number: "DEMO1234" })
  })

  it("books pickups and offers working days", async () => {
    const { client } = clientAt()
    const hours = await client.getPickupHours({ postal_code: "00-001", service_id: 9103 })
    expect(hours.days).toHaveLength(5)
    for (const day of hours.days) {
      expect([0, 6]).not.toContain(new Date(day.date).getUTCDay())
    }
    const sent = await client.sendOrder(order(9103))
    const pickup = await client.orderPickup(sent.id, { date: hours.days[0].date, hour_from: "09:00", hour_to: "16:00" })
    expect(pickup.foreign_courier_id).toMatch(/^DEMO-PICKUP-/)
  })
})

describe("demo option", () => {
  it("needs no credentials and builds the demo client", () => {
    const parsed = parseOptions({ demo: true })
    expect(parsed.enabled).toBe(true)
    if (parsed.enabled) {
      expect(createApaczkaClient(parsed.options).demo).toBe(true)
    }
    expect(parseOptions({}).enabled).toBe(false)
  })

  it("lets the provider list demo services", async () => {
    const provider = new ApaczkaFulfillmentProviderService(
      { logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never },
      { demo: true }
    )
    const options = await provider.getFulfillmentOptions()
    expect(options.length).toBeGreaterThan(0)
  })
})
