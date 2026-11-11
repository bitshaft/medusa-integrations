import path from "node:path"

import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

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
