import path from "node:path"

import type { MedusaContainer } from "@medusajs/framework/types"
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { awardAction, setBirthday } from "../../src/lib/loyalty/server/actions"
import { expirePoints, grantBirthdays } from "../../src/lib/loyalty/server/maintenance"
import {
  awardOrder,
  GIFT_METADATA_KEY,
  revertCanceledOrder,
  revertReturnedUnits,
} from "../../src/lib/loyalty/server/orders"
import { expireRewardCodes, syncCartGifts } from "../../src/lib/loyalty/server/rewards"
import { rewardCatalog } from "../../src/lib/loyalty/server/views"
import { validateGiftQuantity } from "../../src/lib/loyalty/server/hooks"
import { LOYALTY_MODULE } from "../../src/modules/loyalty"
import type LoyaltyModuleService from "../../src/modules/loyalty/service"

jest.setTimeout(120_000)

/**
 * The plugin's business rules against the real loyalty module and Postgres.
 * Orders, carts and customers come from other Medusa modules; here they are
 * fixtures behind `query.graph`, so the flows run without a whole app. The
 * full checkout path is tested on the demo store.
 */
type Row = Record<string, any>

function makeContainer(service: LoyaltyModuleService) {
  const data: Record<string, Row[]> = { order: [], customer: [], cart: [], payment: [] }
  const events: Array<{ name: string; data: Row }> = []
  const matches = (row: Row, filters: Row) =>
    Object.entries(filters ?? {}).every(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if ("$lt" in value) return new Date(row[key]).getTime() < new Date(value.$lt).getTime()
        return true
      }
      if (Array.isArray(value)) return value.includes(row[key])
      return row[key] === value
    })
  const container = {
    resolve(key: string) {
      if (key === LOYALTY_MODULE) return service
      if (key === "query") {
        return {
          graph: async ({ entity, filters }: Row) => {
            const rows = (data[entity] ?? []).filter((row) => matches(row, filters))
            return { data: rows, metadata: { count: rows.length } }
          },
        }
      }
      if (key === "event_bus") return { emit: async (event: { name: string; data: Row }) => void events.push(event) }
      if (key === "logger") return { info() {}, warn() {}, error() {}, debug() {} }
      throw new Error(`unexpected resolve ${key}`)
    },
  } as unknown as MedusaContainer
  return { container, data, events }
}

const paid = (amount: number) => [{ amount, captured_amount: amount, status: "completed" }]
const order = (id: string, customer_id: string, items: Row[], extra: Row = {}) => ({
  id,
  display_id: Number(id.replace(/\D/g, "")) || 1,
  customer_id,
  status: "pending",
  created_at: new Date().toISOString(),
  currency_code: "pln",
  items,
  shipping_methods: [],
  payment_collections: paid(items.reduce((sum, i) => sum + i.total, 0) + 15),
  ...extra,
})
const item = (id: string, quantity: number, total: number, extra: Row = {}) => ({
  id,
  quantity,
  total,
  tax_total: Math.round((total - total / 1.23) * 100) / 100,
  metadata: null,
  detail: { return_received_quantity: 0 },
  ...extra,
})

moduleIntegrationTestRunner<LoyaltyModuleService>({
  moduleName: LOYALTY_MODULE,
  resolve: path.join(__dirname, "../../src/modules/loyalty"),
  pathToMigrations: path.join(__dirname, "../../src/modules/loyalty/migrations"),
  moduleOptions: {},
  testSuite: ({ service }) => {
    let ctx: ReturnType<typeof makeContainer>
    const ANNA = "cus_anna"

    beforeEach(async () => {
      ctx = makeContainer(service)
      ctx.data.customer.push({ id: ANNA, has_account: true, email: "anna@example.com", groups: [] })
      await service.saveSettings({})
    })

    describe("earning", () => {
      it("gives points once the order is paid, rounding down, and never twice", async () => {
        const o = order("order_1", ANNA, [item("i1", 2, 199.98), item("i2", 1, 55.5)])
        o.payment_collections = [{ amount: 270.48, captured_amount: 0, status: "authorized" }]
        ctx.data.order.push(o)
        expect(await awardOrder(ctx.container, "order_1")).toEqual({ status: "skipped", reason: "not_paid" })

        o.payment_collections = paid(270.48)
        expect(await awardOrder(ctx.container, "order_1")).toEqual({ status: "earned", points: 255 })
        // payment.captured and order.placed both arrive: nothing more is written.
        const again = await Promise.all([awardOrder(ctx.container, "order_1"), awardOrder(ctx.container, "order_1")])
        expect(again).toEqual([
          { status: "skipped", reason: "already_earned" },
          { status: "skipped", reason: "already_earned" },
        ])
        expect(await service.balanceOf(ANNA)).toBe(255)
        expect(ctx.events.filter((e) => e.name === "loyalty.points_earned")).toHaveLength(1)
        expect(ctx.events[0].data).toMatchObject({
          customer_id: ANNA,
          points: 255,
          reason: "order",
          order_id: "order_1",
        })
      })

      it("counts net amounts when set, and never gifts or shipping", async () => {
        await service.saveSettings({ earn: { points: 1, per_amount: 1, base: "net" } })
        ctx.data.order.push(
          order("order_2", ANNA, [
            item("i1", 1, 123),
            item("gift", 1, 0, { metadata: { [GIFT_METADATA_KEY]: "lred_x" } }),
          ])
        )
        expect(await awardOrder(ctx.container, "order_2")).toEqual({ status: "earned", points: 100 })
      })

      it("counts orders in other currencies by the admin's rate, and not at all without one", async () => {
        ctx.data.order.push(order("order_eur1", ANNA, [item("i1", 1, 100)], { currency_code: "eur" }))
        expect(await awardOrder(ctx.container, "order_eur1")).toEqual({
          status: "skipped",
          reason: "currency_without_rate",
        })

        await service.saveSettings({ currency_code: "pln", currency_rates: { eur: 4.3 } })
        ctx.data.order.push(order("order_eur2", ANNA, [item("i1", 1, 100)], { currency_code: "eur" }))
        expect(await awardOrder(ctx.container, "order_eur2")).toEqual({ status: "earned", points: 430 })
        // Tier spend and returns use the converted amount.
        const [earn] = await service.entriesByKey(["order:order_eur2:earn"])
        expect((earn.metadata as Row).base_total).toBe(430)
      })

      it("adds the first-order bonus only on the first order", async () => {
        await service.saveSettings({ actions: { first_order: { enabled: true, points: 100 } } })
        const first = order("order_3", ANNA, [item("i1", 1, 100)], { created_at: "2026-01-01T10:00:00Z" })
        const second = order("order_4", ANNA, [item("i1", 1, 100)], { created_at: "2026-02-01T10:00:00Z" })
        ctx.data.order.push(first, second)
        expect(await awardOrder(ctx.container, "order_3")).toEqual({ status: "earned", points: 200 })
        expect(await awardOrder(ctx.container, "order_4")).toEqual({ status: "earned", points: 100 })
      })

      it("gives nothing to guests and excluded groups", async () => {
        await service.saveSettings({ excluded_group_ids: ["cg_b2b"] })
        ctx.data.customer.push(
          { id: "cus_guest", has_account: false, groups: [] },
          { id: "cus_b2b", has_account: true, groups: [{ id: "cg_b2b" }] }
        )
        ctx.data.order.push(
          order("order_g", "cus_guest", [item("i1", 1, 100)]),
          order("order_b", "cus_b2b", [item("i1", 1, 100)])
        )
        expect(await awardOrder(ctx.container, "order_g")).toEqual({ status: "skipped", reason: "guest" })
        expect(await awardOrder(ctx.container, "order_b")).toEqual({ status: "skipped", reason: "excluded" })
        expect(await awardAction(ctx.container, "cus_b2b", "signup")).toBe(0)
      })

      it("gives nothing while the program is switched off", async () => {
        await service.saveSettings({ enabled: false })
        ctx.data.order.push(order("order_off", ANNA, [item("i1", 1, 100)]))
        expect(await awardOrder(ctx.container, "order_off")).toEqual({ status: "skipped", reason: "program_disabled" })
      })
    })

    describe("returns and cancellation", () => {
      beforeEach(async () => {
        ctx.data.order.push(order("order_r", ANNA, [item("a", 2, 200), item("b", 1, 100)]))
        await awardOrder(ctx.container, "order_r")
      })

      it("takes back the share of returned units, by value, step by step", async () => {
        const o = ctx.data.order.find((x) => x.id === "order_r")!
        o.items[0].detail.return_received_quantity = 1
        expect(await revertReturnedUnits(ctx.container, "order_r")).toEqual({ reverted: 100 })
        expect(await revertReturnedUnits(ctx.container, "order_r")).toEqual({ reverted: 0 })
        o.items[0].detail.return_received_quantity = 2
        o.items[1].detail.return_received_quantity = 1
        expect(await revertReturnedUnits(ctx.container, "order_r")).toEqual({ reverted: 200 })
        expect(await service.balanceOf(ANNA)).toBe(0)
        expect(ctx.events.filter((e) => e.name === "loyalty.points_reverted").map((e) => e.data.points)).toEqual([
          -100, -200,
        ])
      })

      it("lets the balance go negative when the points were already spent, and blocks redemptions", async () => {
        await service.redeem({
          customer_id: ANNA,
          reward: { id: "lrew_a", name: "A", kind: "fixed", cost: 250, per_customer_limit: null },
          status: "issued",
          now: new Date(),
        })
        await revertCanceledOrder(ctx.container, "order_r")
        expect(await service.balanceOf(ANNA)).toBe(-250)
        const reward = await service.createLoyaltyRewards({ name: "B", kind: "fixed", value: 10, cost: 10 } as never)
        const catalog = await rewardCatalog(ctx.container, ANNA)
        expect(catalog.find((r) => r.id === reward.id)).toMatchObject({
          can_redeem: false,
          blocked_reason: "negative_balance",
        })
      })

      it("takes back everything on cancel, after a partial return too", async () => {
        ctx.data.order.find((x) => x.id === "order_r")!.items[1].detail.return_received_quantity = 1
        await revertReturnedUnits(ctx.container, "order_r")
        expect(await revertCanceledOrder(ctx.container, "order_r")).toEqual({ reverted: 200 })
        expect(await service.balanceOf(ANNA)).toBe(0)
      })
    })

    describe("tiers", () => {
      const tiers = [
        { id: "bronze", name: "Brąz", threshold: 0, multiplier: 1 },
        { id: "silver", name: "Srebro", threshold: 500, multiplier: 1.25, bonus_points: 50 },
      ]

      it("moves up with spend, adds the bonus once, uses the multiplier next time, and moves down on returns", async () => {
        await service.saveSettings({ tiers: { window_months: 12, levels: tiers } })
        ctx.data.order.push(order("order_t1", ANNA, [item("a", 1, 400)]))
        await awardOrder(ctx.container, "order_t1")
        expect((await service.getAccount(ANNA))?.tier_id).toBe("bronze")

        ctx.data.order.push(order("order_t2", ANNA, [item("a", 1, 200)]))
        await awardOrder(ctx.container, "order_t2")
        expect((await service.getAccount(ANNA))?.tier_id).toBe("silver")
        const changed = ctx.events.filter((e) => e.name === "loyalty.tier_changed").map((e) => e.data)
        expect(changed.at(-1)).toMatchObject({
          customer_id: ANNA,
          to_tier: { id: "silver" },
          direction: "up",
          spend: 600,
        })
        // 400 + 200 + 50 bonus.
        expect(await service.balanceOf(ANNA)).toBe(650)

        ctx.data.order.push(order("order_t3", ANNA, [item("a", 1, 100)]))
        expect(await awardOrder(ctx.container, "order_t3")).toEqual({ status: "earned", points: 125 })

        // Returning the 400 zł item drops the spend to 300: back to bronze, bonus kept (given once).
        ctx.data.order.find((x) => x.id === "order_t1")!.items[0].detail.return_received_quantity = 1
        await revertReturnedUnits(ctx.container, "order_t1")
        expect((await service.getAccount(ANNA))?.tier_id).toBe("bronze")
        const history = await service.listLoyaltyTierChanges({ customer_id: ANNA }, { order: { created_at: "ASC" } })
        expect(history.map((h) => [h.from_tier_id, h.to_tier_id])).toEqual([
          [null, "bronze"],
          ["bronze", "silver"],
          ["silver", "bronze"],
        ])
      })
    })

    describe("tiers under concurrency", () => {
      it("records and announces one tier change when two orders are paid at once", async () => {
        await service.saveSettings({
          tiers: {
            window_months: 12,
            levels: [{ id: "silver", name: "Srebro", threshold: 100, multiplier: 1, bonus_points: 10 }],
          },
        })
        ctx.data.order.push(order("order_c1", ANNA, [item("a", 1, 150)]), order("order_c2", ANNA, [item("a", 1, 150)]))
        await Promise.all([awardOrder(ctx.container, "order_c1"), awardOrder(ctx.container, "order_c2")])
        expect(ctx.events.filter((e) => e.name === "loyalty.tier_changed")).toHaveLength(1)
        expect(await service.listLoyaltyTierChanges({ customer_id: ANNA })).toHaveLength(1)
        expect(await service.balanceOf(ANNA)).toBe(310)
      })
    })

    describe("rewards", () => {
      const gift = { id: "lrew_gift", name: "Kubek", kind: "gift" as const, cost: 100, per_customer_limit: null }

      it("gives the points of a gift back when it leaves the cart, once", async () => {
        await service.post(ANNA, [{ key: "seed", type: "adjustment", reason: "manual", points: 150 }])
        const { redemption } = await service.redeem({
          customer_id: ANNA,
          reward: gift,
          status: "in_cart",
          cart_id: "cart_1",
          now: new Date(),
        })
        ctx.data.cart.push({
          id: "cart_1",
          completed_at: null,
          items: [{ id: "li_1", metadata: { [GIFT_METADATA_KEY]: redemption.id } }],
        })
        expect(await syncCartGifts(ctx.container, "cart_1")).toBe(0)
        expect(await service.balanceOf(ANNA)).toBe(50)

        ctx.data.cart[0].items = []
        const both = await Promise.all([syncCartGifts(ctx.container, "cart_1"), syncCartGifts(ctx.container, "cart_1")])
        expect(both.sort()).toEqual([0, 1])
        expect(await service.balanceOf(ANNA)).toBe(150)
      })

      it("keeps a gift whose cart became an order", async () => {
        await service.post(ANNA, [{ key: "seed", type: "adjustment", reason: "manual", points: 100 }])
        await service.redeem({ customer_id: ANNA, reward: gift, status: "in_cart", cart_id: "cart_2", now: new Date() })
        ctx.data.cart.push({ id: "cart_2", completed_at: new Date().toISOString(), items: [] })
        expect(await syncCartGifts(ctx.container, "cart_2")).toBe(0)
        expect(await service.balanceOf(ANNA)).toBe(0)
      })

      it("refuses to change the quantity of a gift line", () => {
        const cart = {
          items: [
            { id: "li_gift", metadata: { [GIFT_METADATA_KEY]: "lred_1" } },
            { id: "li_x", metadata: null },
          ],
        }
        expect(() => validateGiftQuantity({ input: { item_id: "li_gift", update: { quantity: 3 } }, cart })).toThrow(
          /ilość 1|quantity of 1/
        )
        expect(() =>
          validateGiftQuantity({ input: { item_id: "li_gift", update: { quantity: 0 } }, cart })
        ).not.toThrow()
        expect(() => validateGiftQuantity({ input: { item_id: "li_x", update: { quantity: 3 } }, cart })).not.toThrow()
      })

      it("gives the points of an unused expired code back, or not, as set", async () => {
        const code = { id: "lrew_code", name: "Rabat", kind: "fixed" as const, cost: 100, per_customer_limit: null }
        await service.post(ANNA, [{ key: "seed", type: "adjustment", reason: "manual", points: 200 }])
        const a = await service.redeem({ customer_id: ANNA, reward: code, status: "issued", now: new Date() })
        const b = await service.redeem({ customer_id: ANNA, reward: code, status: "issued", now: new Date() })
        const past = new Date(Date.now() - 1000)
        await service.updateLoyaltyRedemptions([
          { id: a.redemption.id, expires_at: past },
          { id: b.redemption.id, expires_at: past },
        ])
        const settings = await service.getSettings()
        expect(
          await expireRewardCodes(ctx.container, {
            ...settings,
            rewards: { ...settings.rewards, return_points_on_code_expiry: false },
          })
        ).toBe(2)
        expect(await service.balanceOf(ANNA)).toBe(0)
      })
    })

    describe("expiry", () => {
      it("expires the balance after the inactivity period, with one reminder before", async () => {
        const lastOrder = new Date("2025-11-20T10:00:00Z")
        await service.post(ANNA, [{ key: "o", type: "order", reason: "earn", points: 300 }], { activity: lastOrder })
        const settings = await service.getSettings()

        expect(await expirePoints(ctx.container, settings, new Date("2026-10-01T00:00:00Z"))).toEqual({
          expired: 0,
          reminded: 0,
        })
        expect(await expirePoints(ctx.container, settings, new Date("2026-10-25T00:00:00Z"))).toEqual({
          expired: 0,
          reminded: 1,
        })
        expect(await expirePoints(ctx.container, settings, new Date("2026-11-01T00:00:00Z"))).toEqual({
          expired: 0,
          reminded: 0,
        })
        const reminder = ctx.events.find((e) => e.name === "loyalty.points_expiring")!.data
        expect(reminder).toEqual({ customer_id: ANNA, points: 300, expires_at: "2026-11-20T10:00:00.000Z" })

        expect(await expirePoints(ctx.container, settings, new Date("2026-11-20T10:00:00Z"))).toEqual({
          expired: 1,
          reminded: 0,
        })
        expect(await expirePoints(ctx.container, settings, new Date("2026-11-21T10:00:00Z"))).toEqual({
          expired: 0,
          reminded: 0,
        })
        expect(await service.balanceOf(ANNA)).toBe(0)
        expect(ctx.events.find((e) => e.name === "loyalty.points_expired")!.data).toMatchObject({
          customer_id: ANNA,
          points: 300,
        })
      })

      it("does not touch a negative balance", async () => {
        await service.post(ANNA, [{ key: "debt", type: "adjustment", reason: "manual", points: -50 }], {
          activity: new Date("2020-01-01T00:00:00Z"),
        })
        await expirePoints(ctx.container, await service.getSettings(), new Date())
        expect(await service.balanceOf(ANNA)).toBe(-50)
      })
    })

    describe("actions", () => {
      it("gives sign-up and newsletter points once each, only when switched on", async () => {
        expect(await awardAction(ctx.container, ANNA, "signup")).toBe(0)
        await service.saveSettings({
          actions: { signup: { enabled: true, points: 50 }, newsletter: { enabled: true, points: 20 } },
        })
        expect(await awardAction(ctx.container, ANNA, "signup")).toBe(50)
        expect(await awardAction(ctx.container, ANNA, "signup")).toBe(0)
        expect(await awardAction(ctx.container, ANNA, "newsletter", { type: "admin", id: "user_1" })).toBe(20)
        expect(await awardAction(ctx.container, ANNA, "newsletter")).toBe(0)
        expect(await service.balanceOf(ANNA)).toBe(70)
      })

      it("gives birthday points once a year, and locks the date against frequent changes", async () => {
        await service.saveSettings({
          actions: { birthday: { enabled: true, points: 100, change_interval_days: 365, min_days_before: 30 } },
        })
        await setBirthday(ctx.container, ANNA, "1990-05-17", "pl", new Date("2026-01-10T10:00:00Z"))
        await expect(
          setBirthday(ctx.container, ANNA, "1990-05-18", "pl", new Date("2026-03-01T10:00:00Z"))
        ).rejects.toMatchObject({
          reason: "birthday_locked",
        })
        await expect(setBirthday(ctx.container, ANNA, "17.05.1990", "pl")).rejects.toMatchObject({
          reason: "birthday_invalid",
        })

        const settings = await service.getSettings()
        const birthday = new Date("2026-05-17T08:00:00Z")
        expect(await grantBirthdays(ctx.container, settings, "Europe/Warsaw", birthday)).toBe(1)
        expect(await grantBirthdays(ctx.container, settings, "Europe/Warsaw", birthday)).toBe(0)
        expect(await grantBirthdays(ctx.container, settings, "Europe/Warsaw", new Date("2026-05-18T08:00:00Z"))).toBe(0)
        expect(await service.balanceOf(ANNA)).toBe(100)
      })
    })
  },
})
