import { randomBytes } from "node:crypto"
import path from "node:path"

import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createCustomerGroupsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createShippingProfilesWorkflow,
  linkCustomersToCustomerGroupWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

import { recordOrderPlaced } from "../../src/lib/negotiations/server/writers"

jest.setTimeout(300_000)

type Row = Record<string, any>

/**
 * The whole plugin in a running Medusa app (medusa-config.ts in the plugin
 * folder loads src/ as the app's code): Store API, Admin API, the cart
 * guards, the draft order and cart writers, and the events.
 */
medusaIntegrationTestRunner({
  cwd: path.resolve(__dirname, "../.."),
  testSuite: ({ api, getContainer }) => {
    let container: MedusaContainer
    let pk: string
    let regionId: string
    let drill: { id: string; product_id: string }
    let socket: { id: string; product_id: string }
    let admin: Row
    let buyer: Row
    let outsider: Row
    let buyerId: string
    let events: Array<{ name: string; data: Row }>

    const store = (auth?: Row, extra: Row = {}) => ({
      headers: { "x-publishable-api-key": pk, ...(auth?.headers ?? {}), ...extra },
    })
    const call = async (method: "get" | "post" | "delete", url: string, config: Row, body?: unknown) => {
      try {
        return method === "get" || method === "delete"
          ? await api[method](url, config)
          : await api.post(url, body ?? {}, config)
      } catch (error) {
        const response = (error as { response?: Row }).response
        if (!response) throw error
        return response
      }
    }

    async function signUp(email: string, extra: Row = {}): Promise<{ headers: Row; id: string }> {
      // A fresh password per run; nothing to keep in the repo.
      const password = randomBytes(12).toString("base64url")
      const registered = await api.post("/auth/customer/emailpass/register", { email, password })
      const created = await api.post(
        "/store/customers",
        { email, first_name: "Anna", last_name: "Nowak", company_name: "Budmax", ...extra },
        { headers: { "x-publishable-api-key": pk, authorization: `Bearer ${registered.data.token}` } }
      )
      const login = await api.post("/auth/customer/emailpass", { email, password })
      return { headers: { authorization: `Bearer ${login.data.token}` }, id: created.data.customer.id }
    }

    beforeAll(async () => {
      container = getContainer()
      const query = container.resolve(ContainerRegistrationKeys.QUERY)

      const { result: regions } = await createRegionsWorkflow(container).run({
        input: { regions: [{ name: "Polska", currency_code: "pln", countries: ["pl"] }] },
      })
      regionId = regions[0].id

      const { data: stores } = await query.graph({ entity: "store", fields: ["id", "default_sales_channel_id"] })
      const salesChannelId = stores[0].default_sales_channel_id as string

      const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
      const shippingProfileId =
        profiles[0]?.id ??
        (
          await createShippingProfilesWorkflow(container).run({
            input: { data: [{ name: "Default", type: "default" }] },
          })
        ).result[0].id

      const { result: products } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Wiertarka udarowa",
              status: "published",
              shipping_profile_id: shippingProfileId,
              options: [{ title: "Moc", values: ["850 W"] }],
              variants: [
                {
                  title: "850 W",
                  sku: "WU-850",
                  manage_inventory: false,
                  options: { Moc: "850 W" },
                  prices: [{ amount: 429, currency_code: "pln" }],
                },
              ],
              sales_channels: [{ id: salesChannelId }],
            },
            {
              title: "Gniazdo podwójne",
              status: "published",
              shipping_profile_id: shippingProfileId,
              options: [{ title: "Kolor", values: ["białe"] }],
              variants: [
                {
                  title: "białe",
                  sku: "GN-2-W",
                  manage_inventory: false,
                  options: { Kolor: "białe" },
                  prices: [{ amount: 24.5, currency_code: "pln" }],
                },
              ],
              sales_channels: [{ id: salesChannelId }],
            },
          ],
        },
      })
      drill = { id: products[0].variants[0].id, product_id: products[0].id }
      socket = { id: products[1].variants[0].id, product_id: products[1].id }

      const { result: keys } = await createApiKeysWorkflow(container).run({
        input: { api_keys: [{ title: "Test store", type: "publishable", created_by: "test" }] },
      })
      pk = keys[0].token
      await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: keys[0].id, add: [salesChannelId] } })

      const b = await signUp("buyer@example.com")
      buyer = { headers: b.headers }
      buyerId = b.id
      outsider = { headers: (await signUp("retail@example.com", { company_name: null })).headers }
      await api.post(
        "/store/customers/me/addresses",
        {
          first_name: "Anna",
          last_name: "Nowak",
          address_1: "Długa 1",
          city: "Kraków",
          postal_code: "31-001",
          country_code: "pl",
          is_default_shipping: true,
        },
        store(buyer)
      )
      const { result: groups } = await createCustomerGroupsWorkflow(container).run({
        input: { customersData: [{ name: "b2b" }] },
      })
      await linkCustomersToCustomerGroupWorkflow(container).run({ input: { id: groups[0].id, add: [buyerId] } })

      const user = await container
        .resolve(Modules.USER)
        .createUsers({ email: "team@example.com", first_name: "Ola", last_name: "Team" })
      const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
        provider_identities: [{ provider: "emailpass", entity_id: "team@example.com" }],
        app_metadata: { user_id: user.id },
      })
      const token = generateJwtToken(
        { actor_id: user.id, actor_type: "user", auth_identity_id: identity.id, app_metadata: { user_id: user.id } },
        {
          secret: container.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.jwtSecret as string,
          expiresIn: "1d",
        }
      )
      admin = { headers: { authorization: `Bearer ${token}` } }

      const bus = container.resolve(Modules.EVENT_BUS)
      for (const name of [
        "negotiation.created",
        "negotiation.message_added",
        "negotiation.counter_offered",
        "negotiation.accepted",
        "negotiation.rejected",
        "negotiation.added_to_cart",
        "negotiation.draft_order_created",
      ]) {
        bus.subscribe(
          name,
          async (event: { name: string; data: Row }) => void events.push({ name, data: event.data }),
          {
            subscriberId: `test-${name}`,
          }
        )
      }
    })

    beforeEach(() => {
      events = []
    })

    const arm = (armed: { draft_orders: boolean; cart: boolean }) =>
      api.post("/admin/negotiations/settings", { cart_counter_modes: "both", max_discount_bp: null, armed }, admin)

    async function newCart(items: Array<{ variant_id: string; quantity: number }>) {
      const { data } = await api.post("/store/carts", { region_id: regionId }, store(buyer))
      for (const item of items) await api.post(`/store/carts/${data.cart.id}/line-items`, item, store(buyer))
      return data.cart.id as string
    }

    /** A product thread accepted by the customer at 390 zł per unit. */
    async function acceptedProductThread(quantity = 40) {
      const opened = await api.post(
        "/store/negotiations",
        { kind: "product", variant_id: drill.id, quantity, target_unit_price: 36_000, message: "40 sztuk na budowę" },
        store(buyer)
      )
      const id = opened.data.negotiation.id
      const detail = await api.get(`/admin/negotiations/${id}`, admin)
      await api.post(
        `/admin/negotiations/${id}/counter`,
        { version: detail.data.negotiation.version, price: { mode: "unit", unit_price: 39_000 } },
        admin
      )
      const seen = await api.get(`/store/negotiations/${id}`, store(buyer))
      const accepted = await api.post(
        `/store/negotiations/${id}/accept`,
        { version: seen.data.negotiation.version, price: seen.data.negotiation.offer.total },
        store(buyer)
      )
      return accepted.data.negotiation
    }

    it("product path: request, internal note, counter-offer, acceptance; notes never reach the customer", async () => {
      const opened = await api.post(
        "/store/negotiations",
        { kind: "product", variant_id: drill.id, quantity: 40, target_unit_price: 36_000, message: "Czy 360 zł?" },
        store(buyer)
      )
      expect(opened.status).toBe(201)
      const thread = opened.data.negotiation
      expect(thread).toMatchObject({
        kind: "product",
        status: "open",
        turn: "team",
        currency_code: "pln",
        catalog_total: 40 * 42_900,
      })
      expect(thread.lines[0]).toMatchObject({
        variant_id: drill.id,
        sku: "WU-850",
        quantity: 40,
        catalog_unit_price: 42_900,
      })
      expect(thread.number).toMatch(/^NEG-\d{4}-0001$/)

      await api.post(
        `/admin/negotiations/${thread.id}/messages`,
        { type: "internal_note", message: "Nie schodzić poniżej 385 zł" },
        admin
      )
      const detail = await api.get(`/admin/negotiations/${thread.id}`, admin)
      expect(detail.data.messages.map((m: Row) => m.type)).toEqual(["target_price", "internal_note"])
      const counter = await api.post(
        `/admin/negotiations/${thread.id}/counter`,
        {
          version: detail.data.negotiation.version,
          price: { mode: "unit", unit_price: 39_000 },
          message: "Możemy 390 zł",
        },
        admin
      )
      expect(counter.data.negotiation).toMatchObject({
        status: "countered",
        turn: "customer",
        offer_total: 40 * 39_000,
      })

      const seen = await api.get(`/store/negotiations/${thread.id}`, store(buyer))
      const list = await api.get(`/store/negotiations`, store(buyer))
      for (const body of [seen.data, list.data]) {
        const text = JSON.stringify(body)
        expect(text).not.toContain("385")
        expect(text).not.toContain("internal")
        expect(text).not.toContain("assignee")
      }
      expect(seen.data.negotiation.messages.map((m: Row) => m.type)).toEqual(["target_price", "counter_offer"])
      expect(seen.data.negotiation.offer.total).toBe(40 * 39_000)

      const accepted = await api.post(
        `/store/negotiations/${thread.id}/accept`,
        { version: seen.data.negotiation.version, price: seen.data.negotiation.offer.total },
        store(buyer)
      )
      expect(accepted.data.negotiation).toMatchObject({ status: "accepted", turn: null })
      expect(accepted.data.negotiation.accepted).toMatchObject({ total: 40 * 39_000, by: "customer" })
      expect(new Date(accepted.data.negotiation.accepted.until).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000)

      expect(events.map((e) => e.name)).toEqual([
        "negotiation.created",
        "negotiation.message_added",
        "negotiation.counter_offered",
        "negotiation.accepted",
      ])
      const note = events[1].data
      expect(note).toMatchObject({ audience: "team", customer: null })
      expect(note.team.note).toContain("385")
      for (const e of events.filter((e) => e.data.audience === "customer")) {
        expect(JSON.stringify(e.data.customer)).not.toContain("385")
      }
    })

    it("acceptance after the price changed: 409 with the current offer, nothing accepted", async () => {
      const opened = await api.post(
        "/store/negotiations",
        { kind: "product", variant_id: drill.id, quantity: 10, target_unit_price: 38_000 },
        store(buyer)
      )
      const id = opened.data.negotiation.id
      let version = (await api.get(`/admin/negotiations/${id}`, admin)).data.negotiation.version
      version = (
        await api.post(
          `/admin/negotiations/${id}/counter`,
          { version, price: { mode: "unit", unit_price: 41_000 } },
          admin
        )
      ).data.negotiation.version
      const seen = (await api.get(`/store/negotiations/${id}`, store(buyer))).data.negotiation
      await api.post(
        `/admin/negotiations/${id}/counter`,
        { version, price: { mode: "unit", unit_price: 41_500 } },
        admin
      )

      const refused = await call(
        "post",
        `/store/negotiations/${id}/accept`,
        store(buyer, { "accept-language": "en" }),
        {
          version: seen.version,
          price: seen.offer.total,
        }
      )
      expect(refused.status).toBe(409)
      expect(refused.data.code).toBe("price_changed")
      expect(refused.data.messages.pl).toContain("Cena")
      expect(refused.data.message).toBe(refused.data.messages.en)
      expect(refused.data.negotiation.offer.total).toBe(10 * 41_500)
      expect((await api.get(`/store/negotiations/${id}`, store(buyer))).data.negotiation.status).toBe("countered")
    })

    it("whole cart: one amount is spread in whole grosze, shown before sending, never above the typed amount", async () => {
      const cartId = await newCart([
        { variant_id: drill.id, quantity: 3 },
        { variant_id: socket.id, quantity: 7 },
      ])
      const opened = await api.post(
        "/store/negotiations",
        { kind: "cart", cart_id: cartId, target_total: 120_000 },
        store(buyer)
      )
      const thread = opened.data.negotiation
      expect(thread.kind).toBe("cart")
      expect(thread.catalog_total).toBe(3 * 42_900 + 7 * 2_450)
      expect(thread.target.total).toBeLessThanOrEqual(120_000)

      const preview = await api.post(
        `/admin/negotiations/${thread.id}/preview`,
        { price: { mode: "total", total: 133_333 } },
        admin
      )
      expect(preview.data.offer.total).toBeLessThanOrEqual(133_333)
      expect(preview.data.offer.requested_total).toBe(133_333)
      expect(preview.data.modes).toEqual(["total", "lines"])

      const detail = await api.get(`/admin/negotiations/${thread.id}`, admin)
      const sent = await api.post(
        `/admin/negotiations/${thread.id}/counter`,
        { version: detail.data.negotiation.version, price: { mode: "total", total: 133_333 } },
        admin
      )
      expect(sent.data.negotiation.offer_total).toBe(preview.data.offer.total)

      // "Only one amount" in the settings: the per-line mode is refused, the offer already sent stays.
      await api.post(
        "/admin/negotiations/settings",
        { cart_counter_modes: "total", max_discount_bp: null, armed: { draft_orders: false, cart: false } },
        admin
      )
      const lines = await call("post", `/admin/negotiations/${thread.id}/preview`, admin, {
        price: {
          mode: "lines",
          lines: [
            { variant_id: drill.id, unit_price: 1 },
            { variant_id: socket.id, unit_price: 1 },
          ],
        },
      })
      expect(lines.status).toBe(400)
      expect(lines.data.code).toBe("mode_not_allowed")
      const seen = (await api.get(`/store/negotiations/${thread.id}`, store(buyer))).data.negotiation
      expect(seen.offer.total).toBe(preview.data.offer.total)

      // The customer accepts the offer as it came; the lines go into a new cart at the spread unit prices.
      const accepted = await api.post(
        `/store/negotiations/${thread.id}/accept`,
        { version: seen.version, price: seen.offer.total },
        store(buyer)
      )
      expect(accepted.data.negotiation.accepted.lines).toEqual(preview.data.offer.lines)
      await arm({ draft_orders: false, cart: true })
      const target = await newCart([])
      await api.post(`/store/negotiations/${thread.id}/add-to-cart`, { cart_id: target }, store(buyer))
      const cart = (await api.get(`/store/carts/${target}`, store(buyer))).data.cart
      const byVariant = Object.fromEntries(cart.items.map((i: Row) => [i.variant_id, i]))
      for (const offered of preview.data.offer.lines) {
        expect(byVariant[offered.variant_id].quantity).toBe(offered.quantity)
        expect(Math.round(byVariant[offered.variant_id].unit_price * 100)).toBe(offered.unit_price)
      }
      expect(cart.items.reduce((sum: number, i: Row) => sum + Math.round(i.unit_price * 100) * i.quantity, 0)).toBe(
        preview.data.offer.total
      )
    })

    it("cart writer: agreed lines at the agreed price exactly once; again only after removal; quantity locked; checkout checked", async () => {
      const thread = await acceptedProductThread(20)
      const cartId = await newCart([])

      const off = await call("post", `/store/negotiations/${thread.id}/add-to-cart`, store(buyer), { cart_id: cartId })
      expect(off.status).toBe(400)
      expect(off.data.code).toBe("writer_not_armed")
      await arm({ draft_orders: false, cart: true })

      const [first, second] = await Promise.all([
        call("post", `/store/negotiations/${thread.id}/add-to-cart`, store(buyer), { cart_id: cartId }),
        call("post", `/store/negotiations/${thread.id}/add-to-cart`, store(buyer), { cart_id: cartId }),
      ])
      const statuses = [first.status, second.status].sort()
      expect(statuses[0]).toBe(200)
      expect(statuses[1]).toBeGreaterThanOrEqual(400)

      let cart = (await api.get(`/store/carts/${cartId}`, store(buyer))).data.cart
      expect(cart.items).toHaveLength(1)
      const item = cart.items[0]
      expect(item).toMatchObject({ variant_id: drill.id, quantity: 20, unit_price: 390 })
      const [stored] = await container.resolve(Modules.CART).listLineItems({ id: item.id })
      expect(stored.is_custom_price).toBe(true)
      expect(item.metadata).toMatchObject({ negotiation_id: thread.id, negotiation_number: thread.number })

      const again = await call("post", `/store/negotiations/${thread.id}/add-to-cart`, store(buyer), {
        cart_id: cartId,
      })
      expect(again.data.code).toBe("already_in_cart")

      const locked = await call("post", `/store/carts/${cartId}/line-items/${item.id}`, store(buyer), { quantity: 200 })
      expect(locked.status).toBe(400)
      expect(locked.data.code).toBe("negotiated_line_locked")

      const spoofed = await call("post", `/store/carts/${cartId}/line-items`, store(buyer), {
        variant_id: socket.id,
        quantity: 1,
        metadata: { negotiation_id: thread.id },
      })
      expect(spoofed.data.code).toBe("reserved_metadata")

      // Tampered behind the Store API: checkout refuses it.
      await container.resolve(Modules.CART).updateLineItems(item.id, { quantity: 25 })
      const checkout = await call("post", `/store/carts/${cartId}/complete`, store(buyer))
      expect(checkout.status).toBe(400)
      expect(checkout.data.code).toBe("negotiated_line_invalid")

      // Removed, it can be added again while the offer is valid.
      await api.delete(`/store/carts/${cartId}/line-items/${item.id}`, store(buyer))
      const readded = await call("post", `/store/negotiations/${thread.id}/add-to-cart`, store(buyer), {
        cart_id: cartId,
      })
      expect(readded.status).toBe(200)
      cart = (await api.get(`/store/carts/${cartId}`, store(buyer))).data.cart
      expect(cart.items.map((i: Row) => [i.quantity, i.unit_price])).toEqual([[20, 390]])

      const messages = (await api.get(`/admin/negotiations/${thread.id}`, admin)).data.messages
      expect(messages.filter((m: Row) => m.type === "added_to_cart")).toHaveLength(2)
      expect(events.filter((e) => e.name === "negotiation.added_to_cart")).toHaveLength(2)

      // With the lines in a cart, a draft order would sell them twice.
      await arm({ draft_orders: true, cart: true })
      const plan = await api.post(`/admin/negotiations/${thread.id}/draft-order/plan`, {}, admin)
      expect(plan.data.plan.problems).toContain("already_in_cart")

      // Once an order is placed from the lines, no more cart writes.
      const { result: order } = await (await import("@medusajs/medusa/core-flows")).createOrderWorkflow(container).run({
        input: {
          region_id: regionId,
          email: "buyer@example.com",
          customer_id: buyerId,
          items: [
            {
              variant_id: drill.id,
              quantity: 20,
              unit_price: 390,
              title: "Wiertarka",
              metadata: { negotiation_id: thread.id },
            },
          ],
        } as never,
      })
      await recordOrderPlaced(container, order.id)
      const after = await call("post", `/store/negotiations/${thread.id}/add-to-cart`, store(buyer), {
        cart_id: await newCart([]),
      })
      expect(after.data.code).toBe("already_ordered")
    })

    it("draft order: plan with defaults, dry run, write exactly once, with the history", async () => {
      const thread = await acceptedProductThread()
      const disarmed = await api.post(`/admin/negotiations/${thread.id}/draft-order/plan`, {}, admin)
      expect(disarmed.data.plan.problems).toContain("writer_not_armed")
      await arm({ draft_orders: true, cart: false })

      const { data: planned } = await api.post(`/admin/negotiations/${thread.id}/draft-order/plan`, {}, admin)
      expect(planned.plan).toMatchObject({
        problems: [],
        region: { id: regionId },
        region_reason: "address_country",
        total: 40 * 39_000,
        currency_code: "pln",
      })
      expect(planned.plan.address).toMatchObject({ city: "Kraków", country_code: "pl" })
      expect(planned.plan.sales_channel).not.toBeNull()

      const noDryRun = await call("post", `/admin/negotiations/${thread.id}/draft-order/commit`, admin, {
        dry_run_id: planned.run_id,
      })
      expect(noDryRun.data.code).toBe("dry_run_required")

      const { data: dry } = await api.post(
        `/admin/negotiations/${thread.id}/draft-order/dry-run`,
        { address_id: null },
        admin
      )
      expect(dry.ok).toBe(true)
      expect(dry.plan.address).toBeNull()

      const results = await Promise.all([
        call("post", `/admin/negotiations/${thread.id}/draft-order/commit`, admin, { dry_run_id: dry.run_id }),
        call("post", `/admin/negotiations/${thread.id}/draft-order/commit`, admin, { dry_run_id: dry.run_id }),
        call("post", `/admin/negotiations/${thread.id}/draft-order/commit`, admin, { dry_run_id: dry.run_id }),
      ])
      const created = results.filter((r) => r.status === 200)
      expect(created).toHaveLength(1)
      results
        .filter((r) => r.status !== 200)
        .forEach((r) => expect(["draft_order_exists", "write_in_progress"]).toContain(r.data.code))

      const orderId = created[0].data.order_id
      const { data: orders } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "order",
        fields: [
          "id",
          "status",
          "is_draft_order",
          "customer_id",
          "metadata",
          "items.quantity",
          "items.unit_price",
          "items.is_custom_price",
        ],
        filters: { id: orderId },
      })
      expect(orders[0]).toMatchObject({
        status: "draft",
        is_draft_order: true,
        customer_id: buyerId,
        metadata: { negotiation_id: thread.id },
      })
      expect(orders[0].items[0]).toMatchObject({ quantity: 40, unit_price: 390 })

      const again = await call("post", `/admin/negotiations/${thread.id}/draft-order/commit`, admin, {
        dry_run_id: dry.run_id,
      })
      expect(again.data.code).toBe("draft_order_exists")

      const detail = (await api.get(`/admin/negotiations/${thread.id}`, admin)).data
      expect(detail.negotiation.order_id).toBe(orderId)
      const stages = detail.runs.map((r: Row) => r.stage)
      expect(stages).toEqual(expect.arrayContaining(["plan", "dry_run", "commit"]))
      expect(events.filter((e) => e.name === "negotiation.draft_order_created")).toHaveLength(1)

      // The linked order can be read through the module link.
      const { data: linked } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "negotiation_thread",
        fields: ["id", "order.id", "customer_account.email"],
        filters: { id: thread.id },
      })
      expect(linked[0]).toMatchObject({ order: { id: orderId }, customer_account: { email: "buyer@example.com" } })
    })

    it("customer groups and sign-in: refusals with a code in both languages", async () => {
      const outside = await call("post", "/store/negotiations", store(outsider), {
        kind: "product",
        variant_id: drill.id,
        quantity: 1,
        target_unit_price: 100,
      })
      expect(outside.status).toBe(400)
      expect(outside.data.code).toBe("group_not_allowed")
      expect(outside.data.message).toBe(outside.data.messages.pl)
      expect(outside.data.messages.en).toContain("business customers")

      const anonymous = await call("get", "/store/negotiations", store())
      expect(anonymous.status).toBe(401)
      expect(anonymous.data.code).toBe("not_signed_in")
    })

    it("limits: quantity and messages per hour", async () => {
      const big = await call("post", "/store/negotiations", store(buyer), {
        kind: "product",
        variant_id: drill.id,
        quantity: 501,
        target_unit_price: 100,
      })
      expect(big.data.code).toBe("quantity_too_large")

      const { data } = await api.post(
        "/store/negotiations",
        { kind: "product", variant_id: drill.id, quantity: 5, target_unit_price: 40_000 },
        store(buyer)
      )
      let version = data.negotiation.version
      let last: Row = {}
      for (let i = 0; i < 12; i++) {
        last = await call("post", `/store/negotiations/${data.negotiation.id}/messages`, store(buyer), {
          version,
          message: `Pytanie ${i}`,
        })
        if (last.status !== 200) break
        version = last.data.negotiation.version
      }
      expect(last.status).toBe(429)
      expect(last.data.code).toBe("limit_messages_per_hour")
    })

    it("someone else's thread is not found; admin lists, searches and counts", async () => {
      const { data } = await api.post(
        "/store/negotiations",
        { kind: "product", variant_id: drill.id, quantity: 2, target_unit_price: 40_000 },
        store(buyer)
      )
      const foreign = await call("get", `/store/negotiations/${data.negotiation.id}`, store(outsider))
      expect([400, 404]).toContain(foreign.status)

      const list = await api.get("/admin/negotiations?q=wu-850", admin)
      expect(list.data.count).toBe(1)
      expect(list.data.counts.open).toBe(1)
      expect(list.data.oldest_waiting_id).toBe(data.negotiation.id)
      const stats = await api.get("/admin/negotiations/stats", admin)
      expect(stats.data.stats).toMatchObject({ waiting: 1, open: 1, in_talks: { pln: 80_000 } })
    })

    it("installation steps: detected from the store, optional ones marked, events checked by hand", async () => {
      const { data } = await api.get("/admin/negotiations/guide", admin)
      const step = (id: string) => data.steps.find((s: Row) => s.id === id)
      expect(step("install")).toEqual({ id: "install", status: "done" })
      expect(step("expiry")).toMatchObject({ status: "done", optional: true, params: { days: 14 } })
      expect(step("events")).toEqual({ id: "events", status: "manual", optional: true })
      expect(step("groups").optional).toBeUndefined()
      expect(step("draft_orders").optional).toBe(true)
    })

    // Last: it opens threads the counts above don't expect.
    it("net or gross follows Medusa's tax-inclusive pricing, from the catalog price to the cart line", async () => {
      // "Tax inclusive pricing" for PLN (Settings -> Store -> Currencies); the products have PLN prices.
      const pricing = container.resolve(Modules.PRICING)
      const setPlnTaxInclusive = async (isTaxInclusive: boolean) => {
        const [existing] = await pricing.listPricePreferences({ attribute: "currency_code", value: ["pln"] })
        if (existing) await pricing.updatePricePreferences(existing.id, { is_tax_inclusive: isTaxInclusive })
        else
          await pricing.createPricePreferences({
            attribute: "currency_code",
            value: "pln",
            is_tax_inclusive: isTaxInclusive,
          })
      }
      // A customer of its own, so the thread limits of the other tests stay as they were.
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: groups } = await query.graph({ entity: "customer_group", fields: ["id"], filters: { name: "b2b" } })
      const signed = await signUp("gross@example.com")
      await linkCustomersToCustomerGroupWorkflow(container).run({ input: { id: groups[0].id, add: [signed.id] } })
      const customer = { headers: signed.headers }

      const net = await api.get("/admin/negotiations/settings", admin)
      expect(net.data.options).not.toHaveProperty("taxInclusive")
      expect(net.data.price_bases.currencies.pln ?? false).toBe(false)

      await setPlnTaxInclusive(true)
      try {
        const gross = await api.get("/admin/negotiations/settings", admin)
        expect(gross.data.price_bases.currencies.pln).toBe(true)

        // From the product page of the region: the price the customer saw includes tax.
        const opened = await api.post(
          "/store/negotiations",
          { kind: "product", variant_id: drill.id, region_id: regionId, quantity: 5, target_unit_price: 40_000 },
          store(customer)
        )
        const thread = opened.data.negotiation
        expect(thread.tax_inclusive).toBe(true)

        // A whole cart in the region: its lines are priced with tax.
        const { data: created } = await api.post("/store/carts", { region_id: regionId }, store(customer))
        await api.post(
          `/store/carts/${created.cart.id}/line-items`,
          { variant_id: socket.id, quantity: 4 },
          store(customer)
        )
        const cartThread = await api.post(
          "/store/negotiations",
          { kind: "cart", cart_id: created.cart.id, target_total: 9_000 },
          store(customer)
        )
        expect(cartThread.data.negotiation.tax_inclusive).toBe(true)

        // Agreed at 400 zł with tax: the cart line is written with tax included, so checkout adds none on top.
        const detail = await api.get(`/admin/negotiations/${thread.id}`, admin)
        await api.post(
          `/admin/negotiations/${thread.id}/accept`,
          { version: detail.data.negotiation.version, basis: "target", price: detail.data.negotiation.target_total },
          admin
        )
        await arm({ draft_orders: true, cart: true })
        const { data: target } = await api.post("/store/carts", { region_id: regionId }, store(customer))
        const added = await call("post", `/store/negotiations/${thread.id}/add-to-cart`, store(customer), {
          cart_id: target.cart.id,
        })
        expect(added.status).toBe(200)
        const cart = (await api.get(`/store/carts/${target.cart.id}`, store(customer))).data.cart
        const [stored] = await container.resolve(Modules.CART).listLineItems({ id: cart.items[0].id })
        expect(stored).toMatchObject({ quantity: 5, is_tax_inclusive: true })
        expect(Number(stored.unit_price)).toBe(400)

        // The admin's draft order panel shows the same basis.
        const plan = await api.post(`/admin/negotiations/${thread.id}/draft-order/plan`, {}, admin)
        expect(plan.data.plan.tax_inclusive).toBe(true)
      } finally {
        await setPlnTaxInclusive(false)
      }
    })
  },
})
