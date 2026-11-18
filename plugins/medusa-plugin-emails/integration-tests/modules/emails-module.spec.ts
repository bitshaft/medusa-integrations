import path from "node:path"

import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { buildDemoMessages } from "../../src/lib/emails/demo-data"
import { copyKey, GENERAL_KEY, typeKey } from "../../src/lib/emails/settings"
import { EMAILS_MODULE } from "../../src/modules/emails"
import type EmailsModuleService from "../../src/modules/emails/service"

jest.setTimeout(120_000)

/**
 * Runs against a real Postgres (see CI). Configure with DB_HOST,
 * DB_USERNAME and DB_PASSWORD.
 */
moduleIntegrationTestRunner<EmailsModuleService>({
  moduleName: EMAILS_MODULE,
  resolve: path.join(__dirname, "../../src/modules/emails"),
  // Apply the shipped migration instead of generating the schema from models,
  // so the migration itself is under test.
  pathToMigrations: path.join(__dirname, "../../src/modules/emails/migrations"),
  moduleOptions: { from: "Test Shop <orders@shop.test>", team: { recipients: ["team@shop.test"] } },
  testSuite: ({ service, MikroOrmWrapper }) => {
    describe("migration", () => {
      it("matches the data models exactly", async () => {
        const diff = await MikroOrmWrapper.getOrm().getSchemaGenerator().getUpdateSchemaSQL({ wrap: false })
        expect(diff.trim()).toBe("")
      })
    })

    describe("demo send log", () => {
      it("replaces only demo rows, back-dated, and keeps real ones", async () => {
        const real = await service.claimMessage({
          type: "welcome",
          locale: "pl",
          recipient: "real@example.com",
          dedupe_key: "welcome:cus_real",
        } as never)
        let n = 0
        const build = () =>
          buildDemoMessages({
            now: new Date(),
            orders: [1, 2, 3, 4, 5].map((i) => ({
              id: `order_${i}`,
              display_id: 1000 + i,
              email: `b${i}@example.com`,
              customer_id: null,
              total: "10,00 zł",
              locale: "pl",
              real: true,
            })),
            customers: [{ id: "cus_1", email: "c1@example.com", locale: "pl" }],
            team: ["team@shop.test"],
            storeName: "Test Shop",
            defaultLocale: "pl",
            id: (prefix) => `${prefix}_demo_${++n}`,
          })
        await service.replaceDemoMessages(build())
        const second = build()
        await service.replaceDemoMessages(second)

        const rows = await service.listEmailsMessages({}, { take: null })
        expect(rows).toHaveLength(second.length + 1)
        expect(rows.find((r) => r.id === real.message.id)).toBeTruthy()
        const oldest = Math.min(...rows.map((r) => new Date(r.created_at).getTime()))
        expect(Date.now() - oldest).toBeGreaterThan(20 * 86_400_000)
        const withInput = rows.find((r) => r.type === "order-confirmation" && r.input)
        expect(withInput?.input).toMatchObject({ order_id: expect.stringMatching(/^order_/) })
        expect(rows.filter((r) => r.type === "password-reset").every((r) => r.input === null)).toBe(true)
      })
    })

    describe("send log", () => {
      const claim = { type: "order-confirmation", locale: "pl", recipient: "anna@example.com" }

      it("claims an email once per dedupe key", async () => {
        const first = await service.claimMessage({
          ...claim,
          dedupe_key: "order-confirmation:order_1",
          order_id: "order_1",
        })
        const second = await service.claimMessage({ ...claim, dedupe_key: "order-confirmation:order_1" })

        expect(first.duplicate).toBe(false)
        expect(first.message).toMatchObject({ id: expect.stringMatching(/^emsg_/), status: "pending", attempts: 0 })
        expect(second.duplicate).toBe(true)
        expect(second.message.id).toBe(first.message.id)
        expect(await service.listEmailsMessages({ order_id: "order_1" })).toHaveLength(1)
      })

      it("lets only one of two simultaneous claims through", async () => {
        const results = await Promise.all([
          service.claimMessage({ ...claim, dedupe_key: "race:1" }),
          service.claimMessage({ ...claim, dedupe_key: "race:1" }),
        ])
        expect(results.filter((result) => !result.duplicate)).toHaveLength(1)
        expect(await service.listEmailsMessages({ dedupe_key: "race:1" })).toHaveLength(1)
      })

      it("does not dedupe emails without a key", async () => {
        await service.claimMessage(claim)
        await service.claimMessage(claim)
        expect(await service.listEmailsMessages({ recipient: "anna@example.com" })).toHaveLength(2)
      })

      it("finds failed emails that are due for a retry", async () => {
        const { message } = await service.claimMessage({ ...claim, input: { order_id: "order_1" } })
        await service.updateEmailsMessages({
          id: message.id,
          status: "failed",
          retryable: true,
          next_retry_at: new Date(Date.now() - 1000),
          error: "HTTP 503",
        })
        const due = await service.listEmailsMessages({
          status: "failed",
          retryable: true,
          next_retry_at: { $lte: new Date() },
        })
        expect(due.map((entry) => entry.id)).toEqual([message.id])
        expect(due[0].input).toEqual({ order_id: "order_1" })
      })
    })

    describe("settings", () => {
      it("returns the defaults from the options until something is saved", async () => {
        const settings = await service.getSettings()
        expect(settings).toMatchObject({ team_recipients: ["team@shop.test"], low_stock_threshold: 5 })
        expect(settings.types["order-confirmation"].enabled).toBe(true)
      })

      it("saves, updates and resets rows", async () => {
        await service.saveSetting(GENERAL_KEY, { low_stock_threshold: 2 })
        await service.saveSetting(typeKey("welcome"), { enabled: false })
        await service.saveSetting(copyKey("welcome"), { pl: { subject: "Cześć!" } })
        await service.saveSetting(GENERAL_KEY, { low_stock_threshold: 3 })

        let settings = await service.getSettings()
        expect(settings.low_stock_threshold).toBe(3)
        expect(settings.types.welcome).toMatchObject({ enabled: false, copy: { pl: { subject: "Cześć!" } } })
        expect(await service.listEmailsSettings({ key: GENERAL_KEY })).toHaveLength(1)

        await service.saveSetting(copyKey("welcome"), null)
        await service.saveSetting(typeKey("welcome"), {})
        settings = await service.getSettings()
        expect(settings.types.welcome).toMatchObject({ enabled: true, copy: {} })

        // A removed row can be saved again (the unique index ignores deleted rows).
        await service.saveSetting(typeKey("welcome"), { enabled: false })
        expect((await service.getSettings()).types.welcome.enabled).toBe(false)
      })
    })

    describe("low stock alerts", () => {
      it("keeps one alert per item and location", async () => {
        await service.createEmailsLowStockAlerts({ inventory_item_id: "iitem_1", location_id: "sloc_1", available: 2 })
        await expect(
          service.createEmailsLowStockAlerts({ inventory_item_id: "iitem_1", location_id: "sloc_1", available: 1 })
        ).rejects.toThrow()
        await service.createEmailsLowStockAlerts({ inventory_item_id: "iitem_1", location_id: "sloc_2", available: 1 })
        expect(await service.listEmailsLowStockAlerts({})).toHaveLength(2)
      })
    })

    describe("disabled mode", () => {
      it("is enabled with a sender", async () => {
        expect(await service.isEnabled()).toBe(true)
        expect(await service.getDisabledReason()).toBeNull()
      })
    })
  },
})
