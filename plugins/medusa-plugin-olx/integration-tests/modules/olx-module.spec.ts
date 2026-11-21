import path from "node:path"

import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { OLX_MODULE } from "../../src/modules/olx"
import type OlxModuleService from "../../src/modules/olx/service"
import type { AdvertInput } from "../../src/lib/olx/types"

jest.setTimeout(120_000)

const payload: AdvertInput = {
  title: "Marynarka wełniana vintage rozmiar 50",
  description:
    "Włoska marynarka z flaneli wełnianej, stan bardzo dobry, bez przetarć i plam, gotowa do noszenia od zaraz.",
  price: "399.00",
  negotiable: false,
  category_id: 9001,
  attributes: [{ code: "state", value: "used" }],
  images: ["https://cdn.example.com/a.jpg"],
  city_id: 8001,
  district_id: null,
  contact_name: "Sklep",
  contact_phone: null,
  advertiser_type: "business",
}

const options = {
  clientId: "test-client",
  clientSecret: "test-secret",
  redirectUri: "https://shop.example/hooks/olx/oauth/callback",
  encryptionKey: "k".repeat(32),
}

/** Runs against a real Postgres (see CI). Configure with DB_HOST, DB_USERNAME and DB_PASSWORD. */
moduleIntegrationTestRunner<OlxModuleService>({
  moduleName: OLX_MODULE,
  resolve: path.join(__dirname, "../../src/modules/olx"),
  pathToMigrations: path.join(__dirname, "../../src/modules/olx/migrations"),
  moduleOptions: options,
  testSuite: ({ service, MikroOrmWrapper }) => {
    const tokens = {
      access_token: "plain-access",
      refresh_token: "plain-refresh",
      access_expires_at: new Date(Date.now() + 3_600_000),
    }

    it("has a migration that matches the data models exactly", async () => {
      const diff = await MikroOrmWrapper.getOrm().getSchemaGenerator().getUpdateSchemaSQL({ wrap: false })
      expect(diff.trim()).toBe("")
    })

    it("keeps one advert per variant", async () => {
      await service.createRecord({ variant_id: "var_1", product_id: "prod_1", payload })
      await expect(service.createRecord({ variant_id: "var_1", product_id: "prod_1", payload })).rejects.toThrow()
    })

    it("lets exactly one of many workers claim an advert", async () => {
      const row = await service.createRecord({ variant_id: "var_1", product_id: "prod_1", payload })
      const now = new Date()
      const claims = await Promise.all(
        Array.from({ length: 8 }, () => service.claimRecord(row.id, now, new Date(now.getTime() - 120_000)))
      )
      expect(claims.filter(Boolean)).toHaveLength(1)
    })

    it("takes over the claim of a worker that stopped", async () => {
      const row = await service.createRecord({ variant_id: "var_1", product_id: "prod_1", payload })
      const old = new Date(Date.now() - 600_000)
      await service.patchRecord(row.id, { claimed_at: old })
      const now = new Date()
      expect(await service.claimRecord(row.id, now, new Date(now.getTime() - 120_000))).not.toBeNull()
    })

    it("stores the payload and reads it back", async () => {
      const row = await service.createRecord({ variant_id: "var_1", product_id: "prod_1", payload })
      const saved = await service.patchRecord(row.id, {
        olx_advert_id: "500",
        status: "active",
        valid_to: new Date("2026-12-21T00:00:00Z"),
      })
      expect(saved.payload).toEqual(payload)
      expect((await service.findByOlxId("500"))?.id).toBe(row.id)
      expect(await service.counts()).toEqual({ active: 1 })
      expect(await service.listLive(["var_1"])).toHaveLength(1)
    })

    it("finds adverts by title, treating % as text", async () => {
      await service.createRecord({ variant_id: "var_1", product_id: "prod_1", payload })
      expect((await service.listPage({ q: "wełniana", limit: 10, offset: 0 })).count).toBe(1)
      expect((await service.listPage({ q: "%", limit: 10, offset: 0 })).count).toBe(0)
    })

    it("encrypts tokens in the database", async () => {
      await service.connect(tokens, { id: "1", name: "Sklep", is_business: true })
      const [row] = await service.listOlxConnections({})
      expect(row.access_token).not.toContain("plain-access")
      expect(row.refresh_token).not.toContain("plain-refresh")
      expect(await service.readConnection()).toMatchObject({
        access_token: "plain-access",
        refresh_token: "plain-refresh",
      })
    })

    it("never shows a token to the admin", async () => {
      await service.connect(tokens, { id: "1", name: "Sklep", is_business: true })
      const view = JSON.stringify(await service.describeConnection())
      expect(view).toContain("Sklep")
      expect(view).not.toContain("plain-access")
      expect(view).not.toContain("v1.")
    })

    it("a new connection replaces the old one, and disconnecting leaves no token", async () => {
      await service.connect(tokens, { id: "1", name: "Sklep", is_business: true })
      await service.connect(
        { ...tokens, access_token: "second-access" },
        { id: "2", name: "Drugi", is_business: false }
      )
      expect(await service.listOlxConnections({})).toHaveLength(1)
      await service.disconnect()
      expect(await service.readConnection()).toBeNull()
      expect(await service.listOlxConnections({}, { withDeleted: true })).toEqual([])
    })

    it("spends an OAuth state once", async () => {
      const state = await service.startOauth()
      const results = await Promise.all([service.consumeOauthState(state), service.consumeOauthState(state)])
      expect(results.filter(Boolean)).toHaveLength(1)
      expect(await service.consumeOauthState(state)).toBe(false)
    })

    it("refuses an expired or unknown state, and stores only its hash", async () => {
      const state = await service.startOauth(new Date(Date.now() - 3_600_000))
      expect(await service.consumeOauthState(state)).toBe(false)
      const fresh = await service.startOauth()
      const rows = await service.listOlxOauthStates({})
      expect(JSON.stringify(rows)).not.toContain(fresh)
      expect(await service.consumeOauthState("unknown")).toBe(false)
    })

    it("keeps settings and the feed position", async () => {
      expect((await service.getDefaults()).advertiser_type).toBe("business")
      const defaults = { ...(await service.getDefaults()), contact_name: "Sklep", city_id: 8001 }
      await service.saveDefaults(defaults)
      expect(await service.getDefaults()).toMatchObject({ contact_name: "Sklep", city_id: 8001 })
      await service.saveCursor({ since: "2026-11-21T00:00:00.000Z", cursor: "c1", last_success_at: null })
      expect((await service.readCursor())?.cursor).toBe("c1")
    })
  },
})
