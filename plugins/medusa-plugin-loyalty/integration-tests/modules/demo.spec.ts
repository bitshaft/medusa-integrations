import path from "node:path"

import { generateEntityId } from "@medusajs/framework/utils"
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { buildDemoData } from "../../src/lib/loyalty/demo"
import { LOYALTY_MODULE } from "../../src/modules/loyalty"
import type LoyaltyModuleService from "../../src/modules/loyalty/service"

jest.setTimeout(120_000)

const customers = Array.from({ length: 8 }, (_, i) => `cus_demo_${i + 1}`)

/** "Restore test data" against a real Postgres: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD. */
moduleIntegrationTestRunner<LoyaltyModuleService>({
  moduleName: LOYALTY_MODULE,
  resolve: path.join(__dirname, "../../src/modules/loyalty"),
  pathToMigrations: path.join(__dirname, "../../src/modules/loyalty/migrations"),
  moduleOptions: { demo: true },
  testSuite: ({ service, MikroOrmWrapper }) => {
    const sql = (query: string, params: unknown[] = []) =>
      MikroOrmWrapper.getManager().getConnection().execute(query, params)

    const demo = async () =>
      buildDemoData({
        now: new Date(),
        customers,
        giftVariantId: "variant_gift",
        currency: "pln",
        current: await service.getSettings(),
        actorId: "user_admin",
        id: (prefix) => generateEntityId(undefined, prefix),
      })

    describe("replaceWithDemo", () => {
      it("replaces everything, ledger included, and the ledger stays locked afterwards", async () => {
        await service.post("cus_real", [
          { key: "order:o1:earn", type: "order", reason: "earn", points: 120, order_id: "o1" },
        ])
        await service.createLoyaltyRewards({ name: "Old", kind: "free_shipping", cost: 10 })

        const data = await demo()
        await service.replaceWithDemo(data)
        // Twice: a restore replaces the demo set instead of adding to it.
        const again = await demo()
        await service.replaceWithDemo(again)

        expect(await service.getAccount("cus_real")).toBeNull()
        expect(await service.balanceOf("cus_real")).toBe(0)
        const rewards = await service.listLoyaltyRewards({})
        expect(rewards.map((r) => r.name).sort()).toEqual(again.rewards.map((r) => r.name).sort())
        expect(Number(rewards.find((r) => r.kind === "fixed" && r.active)?.value)).toBe(20)
        expect((await service.getSettings()).tiers.levels).toHaveLength(3)

        for (const account of again.accounts) {
          expect(await service.balanceOf(account.customer_id)).toBe(account.balance)
          expect((await service.getAccount(account.customer_id))?.tier_id).toBe(account.tier_id)
        }
        const [{ count }] = await sql(`select count(*)::int as "count" from "loyalty_entry"`)
        expect(count).toBe(again.entries.length)
        const changes = await service.listLoyaltyTierChanges({})
        expect(changes).toHaveLength(again.tier_changes.length)
        expect(changes.every((c) => Number(c.spend) >= 0)).toBe(true)
        // Back-dated: the history spans the year.
        const [{ oldest }] = await sql(`select min("created_at") as "oldest" from "loyalty_entry"`)
        expect(Date.now() - new Date(oldest as string).getTime()).toBeGreaterThan(300 * 86_400_000)

        await expect(sql(`delete from "loyalty_entry"`)).rejects.toThrow(/cannot be changed or deleted/)
        await expect(sql(`update "loyalty_entry" set "points" = 0`)).rejects.toThrow(/cannot be changed or deleted/)
      })

      it("keeps the program working on top of the demo, without paying twice", async () => {
        await service.replaceWithDemo(await demo())
        const before = await service.balanceOf(customers[0])
        const result = await service.post(customers[0], [
          { key: `signup:${customers[0]}`, type: "action", reason: "signup", points: 50 },
          { key: "order:order_new:earn", type: "order", reason: "earn", points: 30, order_id: "order_new" },
        ])
        expect(result.skipped).toEqual([`signup:${customers[0]}`])
        expect(await service.balanceOf(customers[0])).toBe(before + 30)
      })
    })
  },
})
