import path from "node:path"

import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { mergeSettings } from "../../src/lib/back-in-stock/settings"
import type { SubscriptionRecord } from "../../src/lib/back-in-stock/types"
import { BACK_IN_STOCK_MODULE } from "../../src/modules/back-in-stock"
import type BackInStockModuleService from "../../src/modules/back-in-stock/service"

jest.setTimeout(120_000)

const PAIR = { variant_id: "variant_1", sales_channel_id: "sc_1" }
const DAY = 86_400_000

/**
 * Runs against a real Postgres (see CI). Configure with DB_HOST,
 * DB_USERNAME and DB_PASSWORD.
 */
moduleIntegrationTestRunner<BackInStockModuleService>({
  moduleName: BACK_IN_STOCK_MODULE,
  resolve: path.join(__dirname, "../../src/modules/back-in-stock"),
  // Apply the shipped migration instead of generating the schema from models,
  // so the migration itself is under test.
  pathToMigrations: path.join(__dirname, "../../src/modules/back-in-stock/migrations"),
  moduleOptions: { backendUrl: "https://api.shop.test" },
  testSuite: ({ service, MikroOrmWrapper }) => {
    const subscription = (extra: Record<string, unknown> = {}) =>
      service.createBackInStockSubscriptions({
        email: "anna@example.com",
        ...PAIR,
        locale: "pl",
        status: "active",
        ...extra,
      }) as unknown as Promise<SubscriptionRecord>

    describe("migration", () => {
      it("matches the data models exactly", async () => {
        const diff = await MikroOrmWrapper.getOrm().getSchemaGenerator().getUpdateSchemaSQL({ wrap: false })
        expect(diff.trim()).toBe("")
      })
    })

    describe("subscriptions", () => {
      it("allow one open subscription per email, variant and sales channel", async () => {
        await subscription()
        await expect(subscription({ status: "pending" })).rejects.toThrow()
        // Other channels, other variants and ended subscriptions do not count.
        await subscription({ sales_channel_id: "sc_2" })
        await subscription({ variant_id: "variant_2" })
        await subscription({ status: "unsubscribed" })
        expect(await service.listBackInStockSubscriptions({ email: "anna@example.com" })).toHaveLength(4)
      })

      it("end for a purchase matched by customer or email", async () => {
        await subscription({ email: "a@example.com" })
        await subscription({ email: "b@example.com", customer_id: "cus_b" })
        await subscription({ email: "c@example.com", variant_id: "variant_other" })
        expect(await service.endForPurchase(["variant_1"], { email: "A@Example.com" })).toBe(1)
        expect(await service.endForPurchase(["variant_1"], { customer_id: "cus_b", email: "other@example.com" })).toBe(
          1
        )
        expect(await service.endForPurchase(["variant_1"], { email: "c@example.com" })).toBe(0)
        const ended = await service.listBackInStockSubscriptions({ status: "purchased" })
        expect(ended).toHaveLength(2)
        expect(ended.every((row) => row.ended_at)).toBe(true)
      })

      it("find a subscription by its token hash", async () => {
        const created = await subscription()
        const token = await service.issueToken(created.id, "unsubscribe")
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
        const [stored] = await service.listBackInStockTokens({ subscription_id: created.id })
        expect(stored.token_hash).not.toBe(token)
        expect(await service.findByToken(token, "unsubscribe")).toMatchObject({
          subscription: { id: created.id },
          used: false,
        })
        expect(await service.findByToken(token, "confirm")).toBeNull()
      })
    })

    describe("pending checks", () => {
      it("are claimed by one worker only, and a stale claim can be taken over", async () => {
        const now = new Date()
        const { check, created } = await service.upsertCheck(PAIR, now, now, false)
        expect(created).toBe(true)

        const staleBefore = new Date(now.getTime() - 5 * 60_000)
        const [first, second] = await Promise.all([
          service.claimCheck(check.id, now, staleBefore),
          service.claimCheck(check.id, now, staleBefore),
        ])
        expect([first, second].filter(Boolean)).toHaveLength(1)

        const later = new Date(now.getTime() + 10 * 60_000)
        const takenOver = await service.claimCheck(check.id, later, new Date(later.getTime() - 5 * 60_000))
        expect(takenOver).toMatchObject({ id: check.id, claimed_at: later })
      })

      it("collapse into one row and are rescheduled when stock changed during a check", async () => {
        const now = new Date()
        const { check } = await service.upsertCheck(PAIR, now, now, false)
        const repeat = await service.upsertCheck(PAIR, now, new Date(now.getTime() + 60_000), false)
        expect(repeat).toMatchObject({ created: false, check: { id: check.id } })

        const claimed = (await service.claimCheck(check.id, now, new Date(0)))!
        await service.upsertCheck(PAIR, new Date(now.getTime() + 1000), now, false)
        const next = new Date(now.getTime() + 300_000)
        expect(await service.finishCheck(claimed, next)).toMatchObject({ id: check.id, claimed_at: null, due_at: next })

        const again = (await service.claimCheck(check.id, next, new Date(0)))!
        expect(await service.finishCheck(again, next)).toBeNull()
        expect(await service.getCheck(check.id)).toBeNull()
      })
    })

    describe("notifications", () => {
      it("allow one email in flight per subscription and count delivered ones", async () => {
        const created = await subscription()
        const id = await service.claimNotification(created, "restock", 3)
        expect(id).toMatch(/^binot_/)
        expect(await service.claimNotification(created, "restock", 3)).toBeNull()

        const now = new Date()
        await service.completeNotification(id!, created, { status: "sent", via: "notification" }, now)
        expect(await service.listBackInStockSubscriptions({ id: created.id })).toEqual([
          expect.objectContaining({ notification_count: 1, last_notified_at: now }),
        ])

        // Confirmation emails and failures do not count.
        const confirm = await service.claimNotification(created, "confirm", null)
        await service.completeNotification(confirm!, created, { status: "sent", via: "notification" }, now)
        const failed = await service.claimNotification(created, "restock", 3)
        await service.completeNotification(failed!, created, { status: "failed", via: "notification", error: "x" }, now)
        expect((await service.listBackInStockSubscriptions({ id: created.id }))[0].notification_count).toBe(1)
      })

      it("list only subscriptions the guardrails allow", async () => {
        const now = new Date()
        const fresh = await subscription({ email: "fresh@example.com" })
        await subscription({ email: "recent@example.com", last_notified_at: new Date(now.getTime() - 3_600_000) })
        await subscription({ email: "full@example.com", notification_count: 5 })
        await subscription({ email: "pending@example.com", status: "pending" })
        const old = await subscription({
          email: "old@example.com",
          last_notified_at: new Date(now.getTime() - 2 * DAY),
        })

        const allowed = await service.listNotifiable(PAIR, {
          notifiedBefore: new Date(now.getTime() - DAY),
          max: 5,
          demoOnly: false,
        })
        expect(allowed.map((row) => row.id).sort()).toEqual([fresh.id, old.id].sort())
      })
    })

    describe("admin ranking", () => {
      it("ranks variants by people waiting", async () => {
        await subscription({ email: "a@example.com" })
        await subscription({ email: "b@example.com", notification_count: 2 })
        await subscription({ email: "c@example.com", status: "pending" })
        await subscription({ email: "a@example.com", variant_id: "variant_2" })
        await subscription({ email: "d@example.com", variant_id: "variant_2", status: "unsubscribed" })
        await subscription({ email: "e@example.com", variant_id: "variant_3", demo: true })

        const { rows, count } = await service.rankWanted({ limit: 10, offset: 0, demo: false })
        expect(count).toBe(2)
        expect(rows).toEqual([
          { variant_id: "variant_1", sales_channel_id: "sc_1", waiting: 2, pending: 1, notified: 2 },
          { variant_id: "variant_2", sales_channel_id: "sc_1", waiting: 1, pending: 0, notified: 0 },
        ])
        expect((await service.rankWanted({ limit: 10, offset: 0, demo: true })).rows).toHaveLength(1)
      })
    })

    describe("retention", () => {
      it("deletes, expires and anonymises on schedule, keeping rows for statistics", async () => {
        const now = new Date()
        const ago = (days: number) => new Date(now.getTime() - days * DAY)
        const unconfirmed = await subscription({ email: "u@example.com", status: "pending" })
        await service.updateBackInStockSubscriptions({ id: unconfirmed.id, created_at: ago(8) } as never)
        const old = await subscription({ email: "o@example.com" })
        await service.updateBackInStockSubscriptions({ id: old.id, created_at: ago(400) } as never)
        const ended = await subscription({
          email: "e@example.com",
          customer_id: "cus_1",
          status: "unsubscribed",
          ended_at: ago(200),
          notification_count: 3,
        })
        await service.issueToken(ended.id, "unsubscribe")
        const recent = await subscription({ email: "r@example.com", status: "purchased", ended_at: ago(10) })

        const settings = mergeSettings(await service.getOptions(), {})
        expect(await service.applyRetention(settings, now)).toEqual({
          deleted: 1,
          expired: 1,
          anonymized: 1,
          recovered: 0,
        })

        expect(await service.listBackInStockSubscriptions({ id: unconfirmed.id })).toHaveLength(0)
        expect((await service.listBackInStockSubscriptions({ id: old.id }))[0]).toMatchObject({ status: "expired" })
        expect((await service.listBackInStockSubscriptions({ id: ended.id }))[0]).toMatchObject({
          email: null,
          customer_id: null,
          status: "unsubscribed",
          notification_count: 3,
          variant_id: "variant_1",
          anonymized_at: expect.any(Date),
        })
        expect(await service.listBackInStockTokens({ subscription_id: ended.id })).toHaveLength(0)
        expect((await service.listBackInStockSubscriptions({ id: recent.id }))[0].email).toBe("r@example.com")
      })

      it("counts an email left in flight by a crash as sent", async () => {
        const created = await subscription()
        const id = await service.claimNotification(created, "restock", 1)
        await service.updateBackInStockNotifications({
          id: id!,
          created_at: new Date(Date.now() - 2 * 3_600_000),
        } as never)

        const settings = mergeSettings(await service.getOptions(), {})
        expect((await service.applyRetention(settings)).recovered).toBe(1)
        expect((await service.listBackInStockNotifications({ id: id! }))[0].status).toBe("sent")
        expect((await service.listBackInStockSubscriptions({ id: created.id }))[0].notification_count).toBe(1)
      })
    })

    describe("settings", () => {
      it("store admin changes and reset them", async () => {
        await service.saveSettings({ maxNotifications: 3 })
        expect((await service.getSettings()).maxNotifications).toBe(3)
        await service.saveSettings({})
        expect((await service.getSettings()).maxNotifications).toBe(5)
      })
    })
  },
})
