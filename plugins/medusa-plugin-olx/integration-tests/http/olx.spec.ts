import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

import { clearVariantStock, restoreStock } from "../../src/lib/olx/catalog"
import { DemoOlxApi } from "../../src/lib/olx/demo"
import { DEMO_SAMPLES } from "../../src/lib/olx/demo-seed"
import { OLX_MODULE } from "../../src/modules/olx"
import type OlxModuleService from "../../src/modules/olx/service"

jest.setTimeout(300_000)

const DESCRIPTION =
  "Włoska marynarka z flaneli wełnianej, stan bardzo dobry, bez przetarć i plam, gotowa do noszenia od zaraz."

/** A whole Medusa app in demo mode: real routes, workflows and inventory, no OLX. */
medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api, getContainer }) => {
    let headers: { headers: Record<string, string> }
    let container: MedusaContainer
    let productId: string
    let variantId: string
    let itemId: string
    let locationId: string

    const stocked = async () => {
      const levels = await container
        .resolve(Modules.INVENTORY)
        .listInventoryLevels({ inventory_item_id: itemId, location_id: locationId })
      return Number(levels[0].stocked_quantity)
    }

    const advertBody = {
      title: "Marynarka wełniana vintage rozmiar 50",
      description: DESCRIPTION,
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

    const publish = () => api.post("/admin/olx/publish", { variant_id: variantId, advert: advertBody }, headers)

    beforeEach(async () => {
      container = getContainer()
      const user = await container.resolve(Modules.USER).createUsers({ email: "admin@test.local" })
      const token = generateJwtToken(
        { actor_id: user.id, actor_type: "user", auth_identity_id: "auth_test", app_metadata: { user_id: user.id } },
        { secret: "olx-test", expiresIn: "1d" }
      )
      headers = { headers: { authorization: `Bearer ${token}` } }

      const { result: channels } = await createSalesChannelsWorkflow(container).run({
        input: { salesChannelsData: [{ name: "Sklep" }] },
      })
      const channel = channels[0]
      const { result: locations } = await createStockLocationsWorkflow(container).run({
        input: { locations: [{ name: "Magazyn" }] },
      })
      locationId = locations[0].id
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: locationId, add: [channel.id] },
      })
      const { result: profiles } = await createShippingProfilesWorkflow(container).run({
        input: { data: [{ name: "Standard", type: "default" }] },
      })
      const { result: products } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Marynarka wełniana vintage rozmiar 50",
              description: `<p>${DESCRIPTION}</p>`,
              status: "published",
              thumbnail: "https://cdn.example.com/a.jpg",
              shipping_profile_id: profiles[0].id,
              sales_channels: [{ id: channel.id }],
              options: [{ title: "Rozmiar", values: ["50"] }],
              variants: [
                {
                  title: "50",
                  sku: "MAR-50",
                  options: { Rozmiar: "50" },
                  prices: [{ amount: 399, currency_code: "pln" }],
                },
              ],
            },
          ],
        },
      })
      productId = products[0].id
      variantId = products[0].variants[0].id
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: "product_variant",
        fields: ["inventory_items.inventory_item_id"],
        filters: { id: variantId },
      })
      itemId = (data[0] as any).inventory_items[0].inventory_item_id
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: [{ inventory_item_id: itemId, location_id: locationId, stocked_quantity: 1 }] },
      })
    })

    it("needs an admin login", async () => {
      const response = await api.get("/admin/olx/status").catch((error: any) => error.response)
      expect(response.status).toBe(401)
    })

    it("reports demo mode and shows no secrets", async () => {
      const { data } = await api.get("/admin/olx/status", headers)
      expect(data).toMatchObject({ enabled: true, demo: true, connection: { connected: true } })
    })

    it("serves a form filled from the product", async () => {
      const { data } = await api.get(`/admin/olx/products/${productId}`, headers)
      const variant = data.product.variants[0]
      expect(variant).toMatchObject({ variant_id: variantId, store_price: "399.00", in_stock: true, advert: null })
      expect(variant.draft).toMatchObject({
        title: "Marynarka wełniana vintage rozmiar 50",
        description: DESCRIPTION,
        price: "399.00",
        images: ["https://cdn.example.com/a.jpg"],
      })
    })

    it("searches OLX's lists through the routes", async () => {
      expect((await api.get("/admin/olx/categories?q=marynarka", headers)).data.categories.length).toBeGreaterThan(0)
      expect((await api.get("/admin/olx/category-attributes/9001", headers)).data.attributes[0].code).toBe("state")
      expect((await api.get("/admin/olx/cities?q=lodz", headers)).data.cities).toEqual([])
      expect((await api.get("/admin/olx/cities?q=krak", headers)).data.cities[0].name).toBe("Kraków")
      expect((await api.get("/admin/olx/city-districts/8001", headers)).data.districts).toEqual([])
    })

    it("publishes, edits and refuses a second advert", async () => {
      const first = await publish()
      expect(first.data.result).toBe("published")
      expect((await publish()).data).toEqual({ result: "conflict", code: "exists" })

      const edit = await api.post(
        `/admin/olx/adverts/${first.data.advert.id}/edit`,
        { ...advertBody, price: "349.00" },
        headers
      )
      expect(edit.data.result).toBe("saved")
      const { data } = await api.get(`/admin/olx/products/${productId}`, headers)
      expect(data.product.variants[0]).toMatchObject({ price_differs: true, advert: { price: "349.00" } })
      expect((await api.get("/admin/olx/adverts?q=wełniana", headers)).data.count).toBe(1)
    })

    it("answers with what is wrong instead of sending a bad form", async () => {
      const { data } = await api.post(
        "/admin/olx/publish",
        { variant_id: variantId, advert: { ...advertBody, title: "Krótki" } },
        headers
      )
      expect(data).toEqual({ result: "invalid", issues: [{ field: "title", code: "too_short" }] })
    })

    it("takes the product from the variant and refuses a client-sent one", async () => {
      const { data } = await publish()
      expect(data.advert.product_id).toBe(productId)
      const response = await api
        .post("/admin/olx/publish", { variant_id: variantId, product_id: "prod_other", advert: advertBody }, headers)
        .catch((error: any) => error.response)
      expect(response.status).toBe(400)
      const missing = await api
        .post("/admin/olx/publish", { variant_id: "variant_gone", advert: advertBody }, headers)
        .catch((error: any) => error.response)
      expect(missing.status).toBe(404)
    })

    it("reports every requested variant in a bulk publish, also one that is gone", async () => {
      const { data } = await api.post(
        "/admin/olx/publish-bulk",
        { variant_ids: ["variant_gone", variantId], category_id: 9001, attributes: [] },
        headers
      )
      expect(data.results.map((row: any) => row.variant_id)).toEqual(["variant_gone", variantId])
      expect(data.results[0]).toMatchObject({ result: "conflict", code: "variant_missing" })
    })

    it("marks the sale on OLX before the store's stock event can call it a store sale", async () => {
      const { data } = await publish()
      const { markOlxAdvertSoldWorkflow } = require("../../src/workflows/olx")
      const { result } = await markOlxAdvertSoldWorkflow(container).run({
        input: { advert_id: data.advert.id, variant_id: variantId },
      })
      expect(result).toMatchObject({ pending_deactivate: true, pending_success: true, sold_channel: "olx" })
    })

    it("publishes a selection with shared settings", async () => {
      const { data } = await api.post(
        "/admin/olx/publish-bulk",
        { variant_ids: [variantId], category_id: 9001, attributes: [{ code: "state", value: "used" }] },
        headers
      )
      // No contact or city in Settings yet: it reports that, and nothing is published.
      expect(data.results[0].result).toBe("invalid")
      await api.post(
        "/admin/olx/settings",
        {
          contact_name: "Sklep",
          contact_phone: "",
          city_id: 8001,
          city_name: "Warszawa",
          district_id: null,
          advertiser_type: "business",
          negotiable: false,
          category_id: null,
          category_name: "",
          safety: {},
        },
        headers
      )
      const second = await api.post(
        "/admin/olx/publish-bulk",
        { variant_ids: [variantId], category_id: 9001, attributes: [{ code: "state", value: "used" }] },
        headers
      )
      expect(second.data.results[0]).toMatchObject({ variant_id: variantId, result: "published" })
    })

    it("takes the advert down when the store's stock runs out", async () => {
      const { data } = await publish()
      await container
        .resolve(Modules.INVENTORY)
        .updateInventoryLevels([{ inventory_item_id: itemId, location_id: locationId, stocked_quantity: 0 }])
      await api.post("/admin/olx/sync", {}, headers)
      const service = container.resolve<OlxModuleService>(OLX_MODULE)
      expect(await service.getRecord(data.advert.id)).toMatchObject({
        status: "removed_by_user",
        sold_channel: "store",
      })
    })

    it("in demo mode 'sold on OLX' leaves the store's stock alone", async () => {
      const { data } = await publish()
      const sold = await api.post(`/admin/olx/adverts/${data.advert.id}/commands`, { command: "sold" }, headers)
      expect(sold.data).toMatchObject({ result: "saved", advert: { status: "removed_by_user", sold_channel: "olx" } })
      expect(await stocked()).toBe(1)
    })

    it("'sold on OLX' clears free stock, keeping what is reserved", async () => {
      const inventory = container.resolve(Modules.INVENTORY)
      await inventory.updateInventoryLevels([
        { inventory_item_id: itemId, location_id: locationId, stocked_quantity: 3 },
      ])
      await inventory.createReservationItems([{ inventory_item_id: itemId, location_id: locationId, quantity: 1 }])
      const snapshot = await clearVariantStock(container, variantId)
      expect(await stocked()).toBe(1)
      await restoreStock(container, snapshot)
      expect(await stocked()).toBe(3)
    })

    it("brings an advert back only when the item can be bought", async () => {
      const { data } = await publish()
      const id = data.advert.id
      await api.post(`/admin/olx/adverts/${id}/commands`, { command: "deactivate" }, headers)
      await container
        .resolve(Modules.INVENTORY)
        .updateInventoryLevels([{ inventory_item_id: itemId, location_id: locationId, stocked_quantity: 0 }])
      const refused = await api.post(`/admin/olx/adverts/${id}/commands`, { command: "activate" }, headers)
      expect(refused.data).toEqual({ result: "conflict", code: "out_of_stock" })
      await container
        .resolve(Modules.INVENTORY)
        .updateInventoryLevels([{ inventory_item_id: itemId, location_id: locationId, stocked_quantity: 1 }])
      const back = await api.post(`/admin/olx/adverts/${id}/commands`, { command: "activate" }, headers)
      expect(back.data).toMatchObject({ result: "saved", advert: { status: "active" } })
    })

    it("opens with sample adverts in every status, leaving the store's only variant to publish", async () => {
      const { data } = await api.get("/admin/olx/adverts?limit=50", headers)
      expect(data.count).toBe(DEMO_SAMPLES.length)
      expect(new Set(data.adverts.map((row: any) => row.status))).toEqual(
        new Set(["active", "new", "limited", "outdated", "moderated", "failed", "removed_by_user"])
      )
      expect(
        data.adverts
          .filter((row: any) => row.sold_channel)
          .map((row: any) => row.sold_channel)
          .sort()
      ).toEqual(["olx", "store"])
      expect((await api.get(`/admin/olx/products/${productId}`, headers)).data.product.variants[0].advert).toBeNull()
      expect((await publish()).data.result).toBe("published")
    })

    it("uses real products for samples when the store has enough, and leaves the others free", async () => {
      const product = (
        await container.resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "product",
          fields: ["shipping_profile.id", "sales_channels.id"],
          filters: { id: productId },
        })
      ).data[0] as any
      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Koszula oxford vintage rozmiar M",
              status: "published",
              shipping_profile_id: product.shipping_profile.id,
              options: [{ title: "Rozmiar", values: ["M"] }],
              variants: [{ title: "M", options: { Rozmiar: "M" }, prices: [{ amount: 149, currency_code: "pln" }] }],
            },
          ],
        },
      })
      const { data } = await api.get("/admin/olx/adverts?limit=50", headers)
      const real = data.adverts.filter((row: any) => !row.product_id.startsWith("demo_product_"))
      expect(real).toHaveLength(1)
      expect([productId, result[0].id]).toContain(real[0].product_id)
    })

    it("does not touch sample adverts on no real product in a sync", async () => {
      await api.get("/admin/olx/adverts", headers)
      await api.post("/admin/olx/sync", {}, headers)
      const { data } = await api.get("/admin/olx/adverts?status=active", headers)
      expect(data.count).toBe(1)
    })

    it("works on a sample after a restart of the simulated OLX", async () => {
      const { data } = await api.get("/admin/olx/adverts?status=active", headers)
      const id = data.adverts[0].id
      const service = container.resolve<OlxModuleService>(OLX_MODULE)
      const fresh = new DemoOlxApi(service)
      expect((await fresh.getAdvert(data.adverts[0].olx_advert_id))?.status).toBe("active")
      const down = await api.post(`/admin/olx/adverts/${id}/commands`, { command: "deactivate" }, headers)
      expect(down.data).toMatchObject({ result: "saved", advert: { status: "removed_by_user" } })
      const back = await api.post(`/admin/olx/adverts/${id}/commands`, { command: "activate" }, headers)
      expect(back.data).toMatchObject({ result: "saved", advert: { status: "active" } })
    })

    it("'restore test data' puts the set back and leaves products alone", async () => {
      const first = await api.get("/admin/olx/adverts?status=active", headers)
      await api.post(`/admin/olx/adverts/${first.data.adverts[0].id}/commands`, { command: "sold" }, headers)
      expect((await api.get("/admin/olx/adverts?status=active", headers)).data.count).toBe(0)
      expect((await api.post("/admin/olx/demo/reset", {}, headers)).data.restored).toBe(DEMO_SAMPLES.length)
      expect((await api.get("/admin/olx/adverts?status=active", headers)).data.count).toBe(1)
      expect((await api.get(`/admin/products/${productId}`, headers)).status).toBe(200)
      expect(await stocked()).toBe(1)
    })

    it("sends an unknown OAuth state back to the admin without doing anything", async () => {
      const response = await api.get("/hooks/olx/oauth/callback?state=forged&code=abc", {
        maxRedirects: 0,
        validateStatus: () => true,
      })
      expect(response.status).toBe(302)
      expect(response.headers.location).toContain("connected=invalid_state")
    })
  },
})
