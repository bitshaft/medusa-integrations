import path from "node:path"

import { asValue } from "@medusajs/framework/awilix"
import type { MedusaContainer } from "@medusajs/framework/types"
import { createMedusaContainer, Modules } from "@medusajs/framework/utils"
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { GET as dashboardRoute } from "../../src/api/admin/compliance/dashboard/route"
import { GET as requestsRoute } from "../../src/api/admin/compliance/requests/route"
import { refuseInDemo } from "../../src/lib/compliance/api/utils"
import { LAWYER_PLACEHOLDER } from "../../src/lib/compliance/settings"
import { recordConsents, saveConsentType, subjectState } from "../../src/lib/compliance/server/consents"
import { purgeBillingData, eraseForRequest } from "../../src/lib/compliance/server/erasure"
import { collectCustomerData, exportCsvFiles, exportZip } from "../../src/lib/compliance/server/export"
import { recomputeGpsr } from "../../src/lib/compliance/server/gpsr"
import {
  actOnRequest,
  getRequest,
  reviewRequests,
  submitRequest,
  verifyRequest,
} from "../../src/lib/compliance/server/requests"
import { refuseAnonymizedCustomers } from "../../src/lib/compliance/server/session-guard"
import { COMPLIANCE_MODULE } from "../../src/modules/compliance"
import type ComplianceModuleService from "../../src/modules/compliance/service"

jest.setTimeout(180_000)

type Row = Record<string, any>
const DAY = 86_400_000
const system = { type: "system" as const, id: null }
const admin = { type: "user" as const, id: "user_1" }

/**
 * GDPR flows against the real compliance module and Postgres (with the
 * migrations, so the append-only triggers are on). Customers, orders,
 * carts and logins belong to other Medusa modules; here they are small
 * in-memory fakes, and the anonymisation runs as the real workflow.
 */
function makeStore(service: ComplianceModuleService) {
  const now = Date.now()
  const db: Record<string, Row[]> = {
    customer: [
      {
        id: "cus_anna",
        email: "anna@example.com",
        first_name: "Anna",
        last_name: "Kowalska",
        phone: "+48 600 000 000",
        company_name: null,
        has_account: true,
        metadata: { source: "ads" },
        created_at: new Date(now - 400 * DAY).toISOString(),
        addresses: [
          {
            id: "cuaddr_1",
            first_name: "Anna",
            last_name: "Kowalska",
            address_1: "Długa 1",
            city: "Kraków",
            postal_code: "30-001",
            country_code: "pl",
            phone: "600",
          },
        ],
      },
    ],
    order: [
      {
        id: "order_old",
        display_id: 1,
        customer_id: "cus_anna",
        email: "anna@example.com",
        status: "completed",
        created_at: new Date(now - 8 * 365 * DAY).toISOString(),
        currency_code: "pln",
        total: 100,
        items: [{ title: "Czajnik", quantity: 1, unit_price: 100 }],
        shipping_address: {
          id: "oaddr_s1",
          first_name: "Anna",
          last_name: "Kowalska",
          address_1: "Długa 1",
          city: "Kraków",
          postal_code: "30-001",
          country_code: "pl",
          phone: "600",
        },
        billing_address: {
          id: "oaddr_b1",
          first_name: "Anna",
          last_name: "Kowalska",
          address_1: "Długa 1",
          city: "Kraków",
          postal_code: "30-001",
          country_code: "pl",
          phone: "600",
        },
      },
      {
        id: "order_new",
        display_id: 2,
        customer_id: "cus_anna",
        email: "anna@example.com",
        status: "completed",
        created_at: new Date(now - 30 * DAY).toISOString(),
        currency_code: "pln",
        total: 250,
        items: [{ title: "Lampka", quantity: 2, unit_price: 125 }],
        shipping_address: {
          id: "oaddr_s2",
          first_name: "Anna",
          last_name: "Kowalska",
          address_1: "Długa 1",
          city: "Kraków",
          postal_code: "30-001",
          country_code: "pl",
          phone: "600",
        },
        billing_address: {
          id: "oaddr_b2",
          first_name: "Anna",
          last_name: "Kowalska",
          company: "Anna K. Design",
          address_1: "Rynek 5",
          city: "Kraków",
          postal_code: "30-002",
          country_code: "pl",
          phone: "601",
        },
      },
    ],
    cart: [
      {
        id: "cart_1",
        customer_id: "cus_anna",
        completed_at: null,
        email: "anna@example.com",
        shipping_address: { id: "caddr_1", first_name: "Anna", city: "Kraków" },
        billing_address: null,
      },
    ],
    auth_identity: [{ id: "authid_1", app_metadata: { customer_id: "cus_anna" } }],
    product: [],
    // Settings → Store languages (Medusa's Translation module is registered below).
    store: [{ id: "store_1", supported_locales: [{ locale_code: "pl-PL" }, { locale_code: "en-US" }] }],
  }
  const events: Array<{ name: string; data: Row }> = []
  const matches = (row: Row, filters: Row = {}) =>
    Object.entries(filters).every(([key, value]) => {
      if (key === "app_metadata") return row.app_metadata?.customer_id === value.customer_id
      return Array.isArray(value) ? value.includes(row[key]) : row[key] === value
    })
  const addresses = () => [...db.order.flatMap((o) => [o.shipping_address, o.billing_address])]

  const container = createMedusaContainer()
  const register = (key: string, value: unknown) => container.register(key, asValue(value))
  register(COMPLIANCE_MODULE, service)
  register("query", {
    graph: async ({ entity, filters }: Row) => {
      const rows = (db[entity] ?? []).filter((row) => matches(row, filters))
      return { data: structuredClone(rows), metadata: { count: rows.length } }
    },
  })
  register("logger", { info() {}, warn() {}, error() {}, debug() {} })
  register(Modules.TRANSLATION, {})
  register(Modules.EVENT_BUS, {
    emit: async (message: { name: string; data: Row } | Array<{ name: string; data: Row }>) => {
      for (const m of Array.isArray(message) ? message : [message]) events.push({ name: m.name, data: m.data })
    },
    releaseGroupedEvents: async () => {},
    clearGroupedEvents: async () => {},
  })
  register(Modules.CUSTOMER, {
    updateCustomers: async (id: string, data: Row) =>
      Object.assign(
        db.customer.find((c) => c.id === id)!,
        data
      ),
    deleteCustomerAddresses: async (ids: string[]) => {
      for (const c of db.customer) c.addresses = c.addresses.filter((a: Row) => !ids.includes(a.id))
    },
    createCustomerAddresses: async (rows: Row[]) => rows,
  })
  register(Modules.ORDER, {
    updateOrders: async (rows: Row[]) =>
      rows.map((r) =>
        Object.assign(
          db.order.find((o) => o.id === r.id)!,
          r
        )
      ),
    updateOrderAddresses: async (rows: Row[]) =>
      rows.map(({ id, ...r }) =>
        Object.assign(
          addresses().find((a) => a.id === id)!,
          r
        )
      ),
  })
  register(Modules.CART, {
    listCarts: async (filters: Row) =>
      structuredClone(db.cart.filter((c) => c.customer_id === filters.customer_id && !c.completed_at)),
    updateCarts: async (rows: Row[]) =>
      rows.map((r) =>
        Object.assign(
          db.cart.find((c) => c.id === r.id)!,
          r
        )
      ),
    updateAddresses: async (rows: Row[]) =>
      rows.map(({ id, ...r }) =>
        Object.assign(
          db.cart.flatMap((c) => [c.shipping_address]).find((a) => a?.id === id)!,
          r
        )
      ),
  })
  register(Modules.AUTH, {
    deleteAuthIdentities: async (ids: string[]) => {
      db.auth_identity = db.auth_identity.filter((a) => !ids.includes(a.id))
    },
    updateAuthIdentities: async (rows: Row[]) => rows,
  })
  // A data provider of another plugin, registered in the plugin options.
  register("loyalty", {
    exportCustomerData: async (customerId: string) => [{ customer_id: customerId, balance: 120 }],
  })
  return { container: container as unknown as MedusaContainer, db, events }
}

moduleIntegrationTestRunner<ComplianceModuleService>({
  moduleName: COMPLIANCE_MODULE,
  resolve: path.resolve(__dirname, "../../src/modules/compliance"),
  pathToMigrations: path.join(__dirname, "../../src/modules/compliance/migrations"),
  moduleOptions: { dataProviders: [{ module: "loyalty", method: "exportCustomerData", label: "loyalty" }] },
  testSuite: ({ service }) => {
    describe("consent register", () => {
      it("versions consent texts and keeps the old versions", async () => {
        const { container } = makeStore(service)
        const v1 = await saveConsentType(
          container,
          {
            key: "newsletter",
            name: { pl: "Newsletter" },
            placement: "newsletter",
            required: false,
            active: true,
            cookie_category: null,
            text: { pl: "Treść 1" },
          },
          admin
        )
        expect(v1).toEqual({ key: "newsletter", version: 1, new_version: true })
        const same = await saveConsentType(
          container,
          {
            key: "newsletter",
            name: { pl: "Newsletter" },
            placement: "newsletter",
            required: false,
            active: true,
            cookie_category: null,
            text: { pl: "Treść 1" },
          },
          admin
        )
        expect(same).toMatchObject({ version: 1, new_version: false })
        const v2 = await saveConsentType(
          container,
          {
            key: "newsletter",
            name: { pl: "Newsletter" },
            placement: "newsletter",
            required: false,
            active: true,
            cookie_category: null,
            text: { pl: "Treść 2" },
          },
          admin
        )
        expect(v2).toMatchObject({ version: 2, new_version: true })
        const versions = await service.listComplianceConsentVersions(
          { type_key: "newsletter" },
          { order: { version: "ASC" } }
        )
        expect(versions.map((v) => [v.version, (v.text as Row).pl, (v.text as Row).en])).toEqual([
          [1, "Treść 1", LAWYER_PLACEHOLDER],
          [2, "Treść 2", LAWYER_PLACEHOLDER],
        ])
      })

      it("keeps consent names and texts in the store's languages only", async () => {
        const { container, db } = makeStore(service)
        db.store[0].supported_locales = [{ locale_code: "pl-PL" }, { locale_code: "fr-FR" }]
        const saved = await saveConsentType(
          container,
          {
            key: "marketing",
            name: { pl: "Marketing", en: "Marketing", fr: " Marketing FR " },
            placement: "account",
            required: false,
            active: true,
            cookie_category: null,
            text: { pl: "Zgoda", en: "Consent", de: "Einwilligung" },
          },
          admin
        )
        expect(saved).toMatchObject({ version: 1, new_version: true })
        const [type] = await service.listComplianceConsentTypes({ key: "marketing" })
        // English is no longer a store language: dropped on save; French is trimmed.
        expect(type.name).toEqual({ pl: "Marketing", fr: "Marketing FR" })
        const [version] = await service.listComplianceConsentVersions({ type_key: "marketing" })
        // French has no text yet, so it gets the lawyer placeholder; German is dropped.
        expect(version.text).toEqual({ pl: "Zgoda", fr: LAWYER_PLACEHOLDER })
      })

      it("refuses to save when the store's languages can't be read, instead of dropping texts", async () => {
        const { container } = makeStore(service)
        const query = container.resolve("query") as { graph: (config: Row) => Promise<unknown> }
        const graph = query.graph
        query.graph = async (config: Row) => {
          if (config.entity === "store") throw new Error("database down")
          return graph(config)
        }
        await expect(
          saveConsentType(
            container,
            {
              key: "terms-x",
              name: { pl: "Regulamin" },
              placement: "checkout",
              required: true,
              active: true,
              cookie_category: null,
              text: { pl: "Treść", en: "Text" },
            },
            admin
          )
        ).rejects.toThrow(/store's languages/)
        expect(await service.listComplianceConsentTypes({ key: "terms-x" })).toHaveLength(0)
      })

      it("records a consent and its withdrawal as separate entries and emits events", async () => {
        const { container, events } = makeStore(service)
        await saveConsentType(
          container,
          {
            key: "newsletter",
            name: { pl: "Newsletter" },
            placement: "newsletter",
            required: false,
            active: true,
            cookie_category: null,
            text: { pl: "Zgoda" },
          },
          admin
        )
        const subject = { email: "Ola@Example.com" }
        await recordConsents(container, {
          subject,
          choices: [{ type_key: "newsletter", granted: true, version: 1 }],
          source: "storefront",
          actor: system,
        })
        // The same choice again adds nothing.
        await recordConsents(container, {
          subject,
          choices: [{ type_key: "newsletter", granted: true }],
          source: "storefront",
          actor: system,
        })
        await recordConsents(container, {
          subject,
          choices: [{ type_key: "newsletter", granted: false }],
          source: "storefront",
          actor: system,
        })

        const entries = await service.listComplianceConsentEntries(
          { email: "ola@example.com" },
          { order: { created_at: "ASC" } }
        )
        expect(entries.map((e) => e.granted)).toEqual([true, false])
        expect(events.map((e) => e.name)).toEqual(["compliance.consent_granted", "compliance.consent_withdrawn"])
        expect(events[1].data).toMatchObject({ type_key: "newsletter", email: "ola@example.com", version: 1 })
        expect((await subjectState(container, subject))[0]).toMatchObject({ granted: false })

        // Entries are append-only in the database.
        await expect(service.updateComplianceConsentEntries({ id: entries[0].id, granted: false })).rejects.toThrow(
          /cannot be changed or deleted/
        )
      })

      it("refuses a grant to an outdated text and the withdrawal of a required consent", async () => {
        const { container } = makeStore(service)
        const base = {
          name: { pl: "Regulamin" },
          placement: "registration" as const,
          required: true,
          active: true,
          cookie_category: null,
        }
        await saveConsentType(container, { key: "terms", ...base, text: { pl: "v1" } }, admin)
        await saveConsentType(container, { key: "terms", ...base, text: { pl: "v2" } }, admin)
        const subject = { customer_id: "cus_anna" }
        await expect(
          recordConsents(container, {
            subject,
            choices: [{ type_key: "terms", granted: true, version: 1 }],
            source: "storefront",
            actor: system,
          })
        ).rejects.toMatchObject({ code: "consent_version_outdated" })
        await recordConsents(container, {
          subject,
          choices: [{ type_key: "terms", granted: true, version: 2 }],
          source: "storefront",
          actor: system,
        })
        await expect(
          recordConsents(container, {
            subject,
            choices: [{ type_key: "terms", granted: false }],
            source: "storefront",
            actor: system,
          })
        ).rejects.toMatchObject({ code: "consent_required" })
      })
    })

    describe("erasure request", () => {
      it("runs from submission to anonymisation", async () => {
        const { container, db, events } = makeStore(service)

        // 1. Submitted by e-mail: waits for the link, token only in the event.
        const submitted = await submitRequest(container, {
          type: "erasure",
          email: "ANNA@example.com",
          locale: "pl",
          ip_hash: "ip1",
        })
        const verification = events.find((e) => e.name === "compliance.request_verification")!
        expect(verification.data).toMatchObject({
          id: submitted.id,
          email: "anna@example.com",
          customer_id: "cus_anna",
        })
        const token = verification.data.token as string
        const [stored] = await service.listComplianceRequests({ id: submitted.id })
        expect(stored.token_hash).not.toBe(token)
        expect(stored.status).toBe("unverified")

        // 2. Verified with the link: open, with the deadline from the settings.
        const verified = await verifyRequest(container, token)
        expect(verified.status).toBe("open")
        expect(Math.round((verified.deadline_at.getTime() - Date.now()) / DAY)).toBe(30)
        await expect(verifyRequest(container, token)).rejects.toMatchObject({ code: "token_invalid" })

        // 3. Rejecting needs a reason; the admin accepts instead.
        await expect(actOnRequest(container, submitted.id, "reject", admin, " ")).rejects.toThrow(/reason/)
        await expect(eraseForRequest(container, submitted.id, admin)).rejects.toThrow(
          /Accept the erasure request first/
        )
        await actOnRequest(container, submitted.id, "accept", admin, null)

        // 4. Anonymisation.
        await eraseForRequest(container, submitted.id, admin)
        const customer = db.customer[0]
        expect(customer).toMatchObject({
          email: "anon-cusanna@invalid",
          first_name: "[anonimizacja]",
          last_name: "[anonimizacja]",
          phone: null,
          has_account: false,
          metadata: { compliance_anonymized: true },
        })
        expect(customer.addresses).toEqual([])
        expect(db.auth_identity).toEqual([])

        const [oldOrder, newOrder] = db.order
        expect(oldOrder.email).toBe("anon-cusanna@invalid")
        expect(oldOrder.shipping_address).toMatchObject({
          first_name: "[anonimizacja]",
          address_1: "[anonimizacja]",
          phone: null,
          country_code: "pl",
        })
        // Older than the retention period: billing goes now.
        expect(oldOrder.billing_address).toMatchObject({ first_name: "[anonimizacja]", company: "[anonimizacja]" })
        // Recent: billing stays for invoices, without the phone, until the retention ends.
        expect(newOrder.billing_address).toMatchObject({
          first_name: "Anna",
          company: "Anna K. Design",
          address_1: "Rynek 5",
          phone: null,
        })
        expect(newOrder.total).toBe(250)
        expect(db.cart[0]).toMatchObject({ email: "anon-cusanna@invalid" })
        expect(db.cart[0].shipping_address).toMatchObject({ first_name: "[anonimizacja]" })

        const retention = await service.listComplianceOrderRetentions({})
        expect(retention.map((r) => r.order_id)).toEqual(["order_new"])

        expect(events.find((e) => e.name === "compliance.customer_anonymized")?.data).toEqual({
          customer_id: "cus_anna",
          request_id: submitted.id,
        })
        const { request, events: history } = await getRequest(container, submitted.id)
        expect(request.status).toBe("completed")
        expect(history.map((h) => h.action)).toEqual(["submitted", "verified", "accepted", "anonymized", "completed"])

        // 5. Old sessions and tokens of the customer are refused.
        expect(await service.isAnonymized("cus_anna")).toBe(true)
        const payload = Buffer.from(JSON.stringify({ actor_id: "cus_anna", actor_type: "customer" })).toString(
          "base64url"
        )
        let status = 0
        let passed = false
        await refuseAnonymizedCustomers(
          { scope: container, headers: { authorization: `Bearer x.${payload}.y` } } as never,
          { status: (s: number) => ((status = s), { json: () => {} }) } as never,
          () => void (passed = true)
        )
        expect({ status, passed }).toEqual({ status: 401, passed: false })

        // 6. When the retention period ends, the billing address goes too.
        expect(await purgeBillingData(container, new Date(Date.now() + 7 * 365 * DAY))).toBe(1)
        expect(newOrder.billing_address).toMatchObject({ first_name: "[anonimizacja]", company: "[anonimizacja]" })
      })

      it("limits requests per e-mail and expires unverified ones", async () => {
        const { container } = makeStore(service)
        await service.saveSettings({ gdpr: { rate_limit: { per_email: 2 } } })
        await submitRequest(container, { type: "access", email: "x@example.com", locale: "pl", ip_hash: "a" })
        await submitRequest(container, { type: "access", email: "x@example.com", locale: "pl", ip_hash: "b" })
        await expect(
          submitRequest(container, { type: "access", email: "x@example.com", locale: "en", ip_hash: "c" })
        ).rejects.toMatchObject({ code: "rate_limited" })

        const result = await reviewRequests(container, new Date(Date.now() + 3 * DAY))
        expect(result.expired).toBe(2)
        // Requests are never deleted.
        const [one] = await service.listComplianceRequests({ email: "x@example.com" })
        await expect(service.deleteComplianceRequests(one.id)).rejects.toThrow(/cannot be deleted/)
      })
    })

    describe("data export", () => {
      it("collects profile, addresses, orders, consents, requests and provider data", async () => {
        const { container } = makeStore(service)
        await saveConsentType(
          container,
          {
            key: "newsletter",
            name: { pl: "Newsletter" },
            placement: "newsletter",
            required: false,
            active: true,
            cookie_category: null,
            text: { pl: "Zgoda" },
          },
          admin
        )
        await recordConsents(container, {
          subject: { customer_id: "cus_anna" },
          choices: [{ type_key: "newsletter", granted: true }],
          source: "storefront",
          actor: system,
        })
        const data = await collectCustomerData(container, { customer_id: "cus_anna" })
        expect(data.profile).toMatchObject({ email: "anna@example.com", first_name: "Anna" })
        expect(data.addresses).toHaveLength(1)
        expect(data.orders.map((o) => o.id)).toEqual(["order_old", "order_new"])
        expect(data.consents).toEqual([expect.objectContaining({ type_key: "newsletter", granted: true, version: 1 })])
        expect(data.providers).toEqual({ loyalty: [{ customer_id: "cus_anna", balance: 120 }] })

        const files = exportCsvFiles(data).map((f) => f.name)
        expect(files).toEqual([
          "profile.csv",
          "addresses.csv",
          "orders.csv",
          "consents.csv",
          "requests.csv",
          "providers/loyalty.csv",
        ])
        const zip = exportZip(data)
        expect(zip.includes(Buffer.from("data.json"))).toBe(true)
        expect(zip.includes(Buffer.from("anna@example.com"))).toBe(true)
      })
    })

    describe("demo mode", () => {
      it("shows sample data and changes nothing", async () => {
        const { container } = makeStore(service)
        await submitRequest(container, { type: "access", email: "real@example.com", locale: "pl", ip_hash: "r" })
        await recomputeGpsr(container)
        await service.saveSettings({ demo: true })
        const before = {
          requests: (await service.listComplianceRequests({})).length,
          events: (await service.listComplianceRequestEvents({})).length,
          entries: (await service.listComplianceConsentEntries({})).length,
          products: (await service.listComplianceProductSafeties({})).length,
        }

        const responses: Row[] = []
        const res = { json: (body: Row) => void responses.push(body), status: () => res }
        const req = (extra: Row = {}) => ({
          scope: container,
          params: {},
          query: {},
          validatedQuery: { limit: 50, offset: 0 },
          get: () => undefined,
          ...extra,
        })
        await dashboardRoute(req() as never, res as never)
        await requestsRoute(req() as never, res as never)
        expect(responses[0]).toMatchObject({ demo: true, gpsr: { incomplete: 4 } })
        expect(responses[1].requests.map((r: Row) => r.email)).not.toContain("real@example.com")

        let error: unknown = null
        await refuseInDemo(req({ method: "POST" }) as never, res as never, (e?: unknown) => void (error = e))
        expect(String(error)).toMatch(/Demo mode is on/)

        expect({
          requests: (await service.listComplianceRequests({})).length,
          events: (await service.listComplianceRequestEvents({})).length,
          entries: (await service.listComplianceConsentEntries({})).length,
          products: (await service.listComplianceProductSafeties({})).length,
        }).toEqual(before)
      })
    })
  },
})
