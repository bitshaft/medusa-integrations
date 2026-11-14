import path from "node:path"

import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { LOYALTY_MODULE } from "../../src/modules/loyalty"
import type LoyaltyModuleService from "../../src/modules/loyalty/service"

jest.setTimeout(120_000)

const CUSTOMER = "cus_ledger"
type TestReward = { id: string; name: string; kind: "fixed"; cost: number; per_customer_limit: number | null }
const reward: TestReward = { id: "lrew_1", name: "Rabat 20 zł", kind: "fixed", cost: 100, per_customer_limit: null }
const earn = (key: string, points: number, order_id: string | null = null) => ({
  key,
  type: "order" as const,
  reason: "earn" as const,
  points,
  order_id,
})

/** Runs against a real Postgres: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD. */
moduleIntegrationTestRunner<LoyaltyModuleService>({
  moduleName: LOYALTY_MODULE,
  resolve: path.join(__dirname, "../../src/modules/loyalty"),
  pathToMigrations: path.join(__dirname, "../../src/modules/loyalty/migrations"),
  moduleOptions: {},
  testSuite: ({ service, MikroOrmWrapper }) => {
    const sql = (query: string, params: unknown[] = []) =>
      MikroOrmWrapper.getManager().getConnection().execute(query, params)

    describe("migration", () => {
      it("matches the data models exactly", async () => {
        const diff = await MikroOrmWrapper.getOrm().getSchemaGenerator().getUpdateSchemaSQL({ wrap: false })
        expect(diff.trim()).toBe("")
      })
    })

    describe("ledger", () => {
      it("derives the balance from the entries and keeps the account cache in step", async () => {
        await service.post(CUSTOMER, [earn("a", 120), { ...earn("b", -20), reason: "manual", type: "adjustment" }])
        expect(await service.balanceOf(CUSTOMER)).toBe(100)
        expect((await service.getAccount(CUSTOMER))?.balance).toBe(100)
      })

      it("never writes the same event twice", async () => {
        const first = await service.post(CUSTOMER, [earn("order:o1:earn", 50, "o1")])
        const again = await service.post(CUSTOMER, [earn("order:o1:earn", 50, "o1")])
        const both = await Promise.all([
          service.post(CUSTOMER, [earn("order:o2:earn", 70, "o2")]),
          service.post(CUSTOMER, [earn("order:o2:earn", 70, "o2")]),
        ])
        expect(first.created).toHaveLength(1)
        expect(again.created).toHaveLength(0)
        expect(again.skipped).toEqual(["order:o1:earn"])
        expect(both.map((r) => r.created.length).sort()).toEqual([0, 1])
        expect(await service.balanceOf(CUSTOMER)).toBe(120)
      })

      it("refuses to change or delete an entry, even with raw SQL", async () => {
        await service.post(CUSTOMER, [earn("x", 10)])
        await expect(sql(`update "loyalty_entry" set "points" = 999 where "key" = 'x'`)).rejects.toThrow(
          /cannot be changed or deleted/
        )
        await expect(sql(`delete from "loyalty_entry" where "key" = 'x'`)).rejects.toThrow(
          /cannot be changed or deleted/
        )
        expect(await service.balanceOf(CUSTOMER)).toBe(10)
      })

      it("moves the expiry clock only for activity", async () => {
        const at = new Date("2026-03-01T10:00:00Z")
        await service.post(CUSTOMER, [{ ...earn("adj", 5), type: "adjustment", reason: "manual" }])
        expect((await service.getAccount(CUSTOMER))?.last_activity_at).toBeNull()
        await service.post(CUSTOMER, [earn("o", 5)], { activity: at })
        expect((await service.getAccount(CUSTOMER))?.last_activity_at).toEqual(at)
        // An older activity never moves the clock back.
        await service.post(CUSTOMER, [earn("o-old", 5)], { activity: new Date("2025-01-01T00:00:00Z") })
        expect((await service.getAccount(CUSTOMER))?.last_activity_at).toEqual(at)
      })
    })

    describe("redemptions", () => {
      const redeem = (customer = CUSTOMER, r: typeof reward = reward) =>
        service.redeem({ customer_id: customer, reward: r, status: "issued", now: new Date() })

      it("spends points and records the redemption in one go", async () => {
        await service.post(CUSTOMER, [earn("e", 150)])
        const { redemption, balance } = await redeem()
        expect(balance).toBe(50)
        expect(redemption).toMatchObject({ reward_id: "lrew_1", cost: 100, status: "issued" })
        expect(await service.balanceOf(CUSTOMER)).toBe(50)
      })

      it("refuses when the balance does not cover the cost", async () => {
        await service.post(CUSTOMER, [earn("e", 99)])
        await expect(redeem()).rejects.toMatchObject({ reason: "insufficient_points" })
        expect(await service.listLoyaltyRedemptions({})).toHaveLength(0)
      })

      it("two redemptions at the same moment never spend more than the balance", async () => {
        await service.post(CUSTOMER, [earn("e", 150)])
        const results = await Promise.allSettled([redeem(), redeem(), redeem()])
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
        expect(await service.balanceOf(CUSTOMER)).toBe(50)
        expect(await service.listLoyaltyRedemptions({})).toHaveLength(1)
      })

      it("counts the per-customer limit under the same lock", async () => {
        await service.post(CUSTOMER, [earn("e", 1000)])
        const limited = { ...reward, per_customer_limit: 2 }
        const results = await Promise.allSettled([
          redeem(CUSTOMER, limited),
          redeem(CUSTOMER, limited),
          redeem(CUSTOMER, limited),
        ])
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2)
        expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { reason: "limit_reached" } })
      })

      it("blocks redemptions while the balance is negative", async () => {
        await service.post(CUSTOMER, [earn("e", 300, "o1")])
        await redeem()
        await service.revertOrder(CUSTOMER, "o1", "all", "cancel")
        expect(await service.balanceOf(CUSTOMER)).toBe(-100)
        await expect(redeem()).rejects.toMatchObject({ reason: "negative_balance" })
        // New points pay the debt off first.
        await service.post(CUSTOMER, [earn("e2", 250)])
        expect(await service.balanceOf(CUSTOMER)).toBe(150)
        await expect(redeem()).resolves.toMatchObject({ balance: 50 })
      })

      it("gives the points of a redemption back exactly once", async () => {
        await service.post(CUSTOMER, [earn("e", 100)])
        const { redemption } = await redeem()
        const back = await Promise.all([
          service.returnRedemption(redemption.id, "released", { description: "Gift removed" }),
          service.returnRedemption(redemption.id, "released", { description: "Gift removed" }),
        ])
        expect(back.map((r) => r.redemption?.status)).toEqual(["released", "released"])
        expect(back.map((r) => r.changed).sort()).toEqual([false, true])
        expect(await service.balanceOf(CUSTOMER)).toBe(100)
        // A released redemption does not count towards the limit any more.
        await expect(redeem(CUSTOMER, { ...reward, per_customer_limit: 1 })).resolves.toBeDefined()
      })

      it("can close a redemption without giving points back", async () => {
        await service.post(CUSTOMER, [earn("e", 100)])
        const { redemption } = await redeem()
        await service.returnRedemption(redemption.id, "expired", { description: "Code expired", refund: false })
        expect(await service.balanceOf(CUSTOMER)).toBe(0)
      })
    })

    describe("orders", () => {
      it("takes back points step by step for returns, then the rest on cancel, never more", async () => {
        await service.post(CUSTOMER, [
          earn("order:o1:earn", 300, "o1"),
          { key: "first_order:cus", type: "action", reason: "first_order", points: 100, order_id: "o1" },
        ])
        expect((await service.revertOrder(CUSTOMER, "o1", 100, "return")).reverted).toBe(100)
        expect((await service.revertOrder(CUSTOMER, "o1", 100, "return")).reverted).toBe(0)
        expect((await service.revertOrder(CUSTOMER, "o1", 150, "return")).reverted).toBe(50)
        expect(await service.balanceOf(CUSTOMER)).toBe(250)
        // Cancel takes back the rest, including the first-order bonus.
        expect((await service.revertOrder(CUSTOMER, "o1", "all", "cancel")).reverted).toBe(250)
        expect((await service.revertOrder(CUSTOMER, "o1", "all", "cancel")).reverted).toBe(0)
        expect(await service.balanceOf(CUSTOMER)).toBe(0)
      })

      it("does not race with itself", async () => {
        await service.post(CUSTOMER, [earn("order:o1:earn", 300, "o1")])
        await Promise.all([
          service.revertOrder(CUSTOMER, "o1", 200, "return"),
          service.revertOrder(CUSTOMER, "o1", 200, "return"),
        ])
        expect(await service.balanceOf(CUSTOMER)).toBe(100)
      })
    })

    describe("settings", () => {
      it("starts from the defaults and stores the owner's settings", async () => {
        expect((await service.getSettings()).earn.points).toBe(1)
        const saved = await service.saveSettings({
          earn: { points: 2, per_amount: 1 },
          terms_url: "https://sklep.pl/regulamin",
        })
        expect(saved.earn).toEqual({ points: 2, per_amount: 1, base: "gross" })
        expect((await service.getSettings()).terms_url).toBe("https://sklep.pl/regulamin")
        await expect(service.saveSettings({ earn: { per_amount: 0 } })).rejects.toThrow()
      })
    })
  },
})
