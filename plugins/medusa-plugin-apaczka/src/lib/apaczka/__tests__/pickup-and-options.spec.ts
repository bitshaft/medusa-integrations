import { MedusaError } from "@medusajs/framework/utils"

import { ApaczkaClient } from "../client"
import { buildFulfillmentOptions } from "../fulfillment-options"
import { optionsForService, resolveOptions } from "../options"
import { formatDate, resolvePickup } from "../pickup"
import { APP_ID, APP_SECRET, options, serviceStructure } from "./fixtures"

const all = buildFulfillmentOptions(serviceStructure, options())
const byId = (id: string) => all.find((o) => o.id === id)!

describe("resolvePickup", () => {
  const client = new ApaczkaClient({ appId: APP_ID, appSecret: APP_SECRET, fetch: jest.fn() })
  const pickup = options().pickup
  // Wednesday
  const now = new Date(2026, 6, 15, 12, 0)

  afterEach(() => jest.restoreAllMocks())

  it("uses SELF unless a courier is wanted or required", async () => {
    await expect(
      resolvePickup({ client, option: byId("apaczka-21"), serviceId: 21, senderPostalCode: "00-001", pickup, now })
    ).resolves.toEqual({
      type: "SELF",
    })
  })

  it("books a courier when the service requires one, on the first available day", async () => {
    jest.spyOn(client, "getPickupHours").mockResolvedValue({
      postal_code: "00-001",
      days: [
        { date: "2026-07-14", services: {} },
        { date: "2026-07-16", services: {} },
      ],
    })
    await expect(
      resolvePickup({ client, option: byId("apaczka-22"), serviceId: 22, senderPostalCode: "00-001", pickup, now })
    ).resolves.toEqual({ type: "COURIER", date: "2026-07-16", hours_from: "09:00", hours_to: "16:00" })
  })

  it("falls back to the next business day when pickup hours are unavailable", async () => {
    jest.spyOn(client, "getPickupHours").mockRejectedValue(new Error("down"))
    const logger = { warn: jest.fn() }
    const saturday = new Date(2026, 6, 18, 9, 0)
    const result = await resolvePickup({
      client,
      option: byId("apaczka-21"),
      serviceId: 21,
      senderPostalCode: "00-001",
      pickup: { ...pickup, type: "COURIER" },
      logger,
      now: saturday,
    })
    expect(result).toMatchObject({ type: "COURIER", date: "2026-07-20" })
    expect(logger.warn).toHaveBeenCalled()
  })

  it("never books a courier for services without courier pickup", async () => {
    await expect(
      resolvePickup({
        client,
        option: byId("apaczka-41"),
        serviceId: 41,
        senderPostalCode: "00-001",
        pickup: { ...pickup, type: "COURIER" },
        now,
      })
    ).resolves.toEqual({ type: "SELF" })
  })

  it("formats local dates", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})

describe("options", () => {
  it("applies defaults", () => {
    const resolved = options()
    expect(resolved).toMatchObject({
      environment: "production",
      shipmentCreation: "auto",
      labelFormat: "pdf",
      parcel: { strategy: "single", weightUnit: "g" },
      pricing: { basis: "gross", markupPercent: 0 },
      tracking: { polling: true, markShipped: true, markDelivered: true },
    })
  })

  it("lists every problem in one readable error", () => {
    let error: unknown
    try {
      resolveOptions({ appId: "", environment: "staging", pickup: { hoursFrom: "9am" } })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(MedusaError)
    const message = (error as Error).message
    expect(message).toContain("appId")
    expect(message).toContain("appSecret")
    expect(message).toContain("environment")
    expect(message).toContain("pickup.hoursFrom")
  })

  it("merges per-service overrides", () => {
    const resolved = options({
      pricing: { markupPercent: 10 },
      defaultOptions: { "1": 1 },
      services: { "41": { pricing: { markupFixed: 2 }, options: { "2": 1 }, parcel: { packageType: "KOPERTA" } } },
    })
    const scoped = optionsForService(resolved, 41)
    expect(scoped.pricing).toMatchObject({ markupPercent: 10, markupFixed: 2 })
    expect(scoped.parcel.packageType).toBe("KOPERTA")
    expect(scoped.additionalServices).toEqual({ "1": 1, "2": 1 })
    expect(optionsForService(resolved, 21).pricing.markupFixed).toBe(0)
  })
})
