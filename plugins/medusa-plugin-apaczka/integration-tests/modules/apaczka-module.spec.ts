import path from "node:path"

import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import type { ApaczkaPoint } from "../../src/lib/apaczka/client"
import { ApaczkaPointStore } from "../../src/lib/apaczka/point-store"
import { APACZKA_MODULE } from "../../src/modules/apaczka"
import type ApaczkaModuleService from "../../src/modules/apaczka/service"

const point = (
  id: string,
  city: string,
  lat: number,
  lng: number,
  extra: Partial<ApaczkaPoint> = {}
): ApaczkaPoint => ({
  type: "INPOST",
  subtype: "parcel_locker",
  name: `Przy sklepie ${id}`,
  foreign_address_id: id,
  address: {
    line1: `Ulica ${id} 1`,
    postal_code: "00-001",
    city,
    country_code: "PL",
    latitude: String(lat),
    longitude: String(lng),
  },
  open_hours: { mon: [["08:00", "20:00"]] },
  ...extra,
})

const ids = (points: ApaczkaPoint[]) => points.map((p) => p.foreign_address_id)

jest.setTimeout(120_000)

/**
 * Runs against a real Postgres (see CI). Configure with DB_HOST,
 * DB_USERNAME and DB_PASSWORD.
 */
moduleIntegrationTestRunner<ApaczkaModuleService>({
  moduleName: APACZKA_MODULE,
  resolve: path.join(__dirname, "../../src/modules/apaczka"),
  // Apply the shipped migration instead of generating the schema from models,
  // so the migration itself is under test.
  pathToMigrations: path.join(__dirname, "../../src/modules/apaczka/migrations"),
  moduleOptions: { appId: "test-app", appSecret: "test-secret", environment: "sandbox" },
  testSuite: ({ service, MikroOrmWrapper }) => {
    describe("migration", () => {
      it("matches the data models exactly", async () => {
        const diff = await MikroOrmWrapper.getOrm().getSchemaGenerator().getUpdateSchemaSQL({ wrap: false })
        expect(diff.trim()).toBe("")
      })
    })

    describe("shipments", () => {
      it("stores the Settings tab, with defaults until saved", async () => {
        expect(await service.getSettings()).toEqual({ hold_without_weight: false })
        await service.saveSettings({ hold_without_weight: true })
        await service.saveSettings({ hold_without_weight: true })
        expect(await service.getSettings()).toEqual({ hold_without_weight: true })
        expect(await service.listApaczkaSettings({})).toHaveLength(1)
      })

      it("creates a shipment with defaults", async () => {
        const shipment = await service.createApaczkaShipments({
          fulfillment_id: "ful_1",
          order_id: "order_1",
          service_id: 21,
        })
        expect(shipment).toMatchObject({
          id: expect.stringMatching(/^apzship_/),
          status: "pending",
          is_return: false,
          is_cod: false,
          label_format: "pdf",
        })
      })

      it("allows only one shipment per fulfillment", async () => {
        await service.createApaczkaShipments({ fulfillment_id: "ful_dup", service_id: 21 })
        await expect(service.createApaczkaShipments({ fulfillment_id: "ful_dup", service_id: 21 })).rejects.toThrow()
      })

      it("finds shipments by Apaczka order ID", async () => {
        await service.createApaczkaShipments({ fulfillment_id: "ful_2", service_id: 41, apaczka_order_id: "555" })
        const [found] = await service.listApaczkaShipments({ apaczka_order_id: "555" })
        expect(found.fulfillment_id).toBe("ful_2")
      })

      it("searches the shipments list the way the admin page does", async () => {
        await service.createApaczkaShipments([
          { fulfillment_id: "ful_s1", service_id: 21, waybill_number: "6200012345678", order_id: "order_a" },
          { fulfillment_id: "ful_s2", service_id: 21, apaczka_order_id: "9123", order_id: "order_b", is_return: true },
          { fulfillment_id: "ful_s3", service_id: 21, waybill_number: "X_100%", order_id: "order_c" },
        ])
        const search = (q: string, extra: Record<string, unknown> = {}) =>
          service
            .listApaczkaShipments({
              $or: [
                { waybill_number: { $ilike: `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` } },
                { apaczka_order_id: { $ilike: `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` } },
                { order_id: q },
              ],
              ...extra,
            })
            .then((rows) => rows.map((r) => r.fulfillment_id).sort())

        expect(await search("12345")).toEqual(["ful_s1"])
        expect(await search("912")).toEqual(["ful_s2"])
        expect(await search("order_c")).toEqual(["ful_s3"])
        // LIKE wildcards in the query are literal.
        expect(await search("_")).toEqual(["ful_s3"])
        expect(await search("%")).toEqual(["ful_s3"])
        expect(await search("912", { is_return: false })).toEqual([])
      })
    })

    describe("recordTrackingEvents", () => {
      it("stores only new events", async () => {
        const shipment = await service.createApaczkaShipments({ fulfillment_id: "ful_3", service_id: 21 })
        const event = {
          source: "webhook" as const,
          status: "in_transit" as const,
          raw_status: "ON_THE_WAY",
          description: "In transit",
          place: "Warszawa",
          occurred_at: new Date("2026-10-06T00:45:00Z"),
        }

        const first = await service.recordTrackingEvents(shipment.id, [event, event])
        expect(first).toHaveLength(1)

        const again = await service.recordTrackingEvents(shipment.id, [
          event,
          { ...event, status: "delivered", raw_status: "DELIVERED", occurred_at: new Date("2026-10-07T10:00:00Z") },
        ])
        expect(again).toHaveLength(1)
        expect(again[0].raw_status).toBe("DELIVERED")

        const withEvents = await service.retrieveApaczkaShipment(shipment.id, { relations: ["events"] })
        expect(withEvents.events).toHaveLength(2)
      })

      it("cascades deletes to events", async () => {
        const shipment = await service.createApaczkaShipments({ fulfillment_id: "ful_4", service_id: 21 })
        await service.recordTrackingEvents(shipment.id, [
          {
            source: "polling",
            status: "posted",
            raw_status: "PICKUP",
            occurred_at: new Date("2026-10-06T08:00:00Z"),
          },
        ])
        await service.deleteApaczkaShipments(shipment.id)
        expect(await service.listApaczkaTrackingEvents({ shipment_id: shipment.id })).toHaveLength(0)
      })
    })

    describe("accessors", () => {
      it("exposes a sandbox client and resolved options", async () => {
        const client = await service.getClient()
        expect(client.environment).toBe("sandbox")
        expect((await service.getOptions()).shipmentCreation).toBe("auto")
      })
    })

    describe("parcel points (ApaczkaPointStore)", () => {
      const store = () => new ApaczkaPointStore(() => MikroOrmWrapper.getOrm().em.getConnection().getKnex())
      const base = { type: "INPOST", countryCode: "PL", terms: [] as string[], limit: 50 }

      it("locks a list for one sync at a time, and takes over a dead one", async () => {
        const points = store()
        const now = new Date("2026-11-25T10:00:00Z")
        expect(await points.tryLock("DPD", "PL", now, 600_000)).toBe(true)
        expect(await points.tryLock("DPD", "PL", now, 600_000)).toBe(false)
        expect(await points.tryLock("DPD", "PL", new Date(now.getTime() + 601_000), 600_000)).toBe(true)
        await points.finish("DPD", "PL", { now, error: "Apaczka is down" })
        expect(await points.getStatus("DPD", "PL")).toMatchObject({ status: "failed", error: "Apaczka is down" })
        expect(await points.tryLock("DPD", "PL", now, 600_000)).toBe(true)
      })

      it("stores a list and searches it by text, area and distance", async () => {
        const points = store()
        const syncedAt = new Date("2026-11-25T10:00:00Z")
        await points.tryLock("INPOST", "PL", syncedAt, 600_000)
        const count = await points.replace(
          "INPOST",
          "PL",
          [
            point("WAW01M", "Warszawa", 52.23, 21.01),
            point("KRA01M", "Kraków", 50.06, 19.94),
            point("LOD01M", "Łódź", 51.76, 19.46, { option_cod: false }),
            point("WAW01M", "Warszawa", 52.23, 21.01), // repeated: stored once
          ],
          syncedAt
        )
        await points.finish("INPOST", "PL", { now: syncedAt, source: "production", count })
        expect(count).toBe(3)
        expect(await points.getStatus("INPOST", "PL")).toMatchObject({
          status: "idle",
          source: "production",
          point_count: 3,
          succeeded_at: syncedAt,
        })

        expect(ids(await points.search({ ...base, terms: ["lodz"] }))).toEqual(["LOD01M"])
        expect(ids(await points.search({ ...base, terms: ["ulica", "krakow"] }))).toEqual(["KRA01M"])
        expect(ids(await points.search({ ...base, terms: ["100%"] }))).toEqual([])
        expect(
          ids(await points.search({ ...base, bbox: { west: 19, south: 50, east: 20, north: 52 } })).sort()
        ).toEqual(["KRA01M", "LOD01M"])
        expect(ids(await points.search({ ...base, origin: { latitude: 50.05, longitude: 19.93 } }))).toEqual([
          "KRA01M",
          "LOD01M",
          "WAW01M",
        ])
        expect(ids(await points.search({ ...base, cod: true })).sort()).toEqual(["KRA01M", "WAW01M"])
        expect(ids(await points.search({ ...base, type: "DPD" }))).toEqual([])

        const found = await points.find("INPOST", "PL", " waw01m ")
        expect(found).toMatchObject({
          foreign_address_id: "WAW01M",
          name: "Przy sklepie WAW01M",
          address: { city: "Warszawa", latitude: "52.23", longitude: "21.01" },
          open_hours: { mon: [["08:00", "20:00"]] },
          option_cod: true,
        })
        expect(await points.find("INPOST", "PL", "NOPE01")).toBeUndefined()
      })

      it("updates kept points and removes points a new list no longer has", async () => {
        const points = store()
        const first = new Date("2026-11-25T10:00:00Z")
        await points.replace(
          "INPOST",
          "PL",
          [point("WAW01M", "Warszawa", 52.23, 21.01), point("OLD01M", "Gdańsk", 54.35, 18.65)],
          first
        )
        const second = new Date("2026-11-25T16:00:00Z")
        await points.replace(
          "INPOST",
          "PL",
          [point("WAW01M", "Warszawa", 52.24, 21.02, { name: "Nowa nazwa" }), point("NEW01M", "Poznań", 52.4, 16.9)],
          second
        )

        expect(ids(await points.search(base)).sort()).toEqual(["NEW01M", "WAW01M"])
        expect(await points.find("INPOST", "PL", "WAW01M")).toMatchObject({
          name: "Nowa nazwa",
          address: { latitude: "52.24" },
        })
        expect(await points.find("INPOST", "PL", "OLD01M")).toBeUndefined()
      })
    })
  },
})
