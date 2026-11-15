import path from "node:path"

import { asValue } from "@medusajs/framework/awilix"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, createMedusaContainer, Modules } from "@medusajs/framework/utils"
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import { NegotiationError } from "../../src/lib/negotiations/messages"
import { resetDemo } from "../../src/lib/negotiations/server/demo"
import {
  customerAccept,
  customerReply,
  openThread,
  sweep,
  teamAccept,
  teamCounter,
  teamNote,
} from "../../src/lib/negotiations/server/threads"
import { planDraftOrder } from "../../src/lib/negotiations/server/writers"
import { customerView } from "../../src/lib/negotiations/views"
import { NEGOTIATIONS_MODULE } from "../../src/modules/negotiations"
import type NegotiationsModuleService from "../../src/modules/negotiations/service"

jest.setTimeout(180_000)

type Row = Record<string, any>
const DAY = 86_400_000

/**
 * Moves, expiry and exactly-once writes against the real module and
 * Postgres (with the migrations: bigint amounts, partial unique indexes and
 * the append-only trigger). Customers and variants belong to other Medusa
 * modules; here they are small fixtures behind `query.graph`.
 */
moduleIntegrationTestRunner<NegotiationsModuleService>({
  moduleName: NEGOTIATIONS_MODULE,
  resolve: path.resolve(__dirname, "../../src/modules/negotiations"),
  pathToMigrations: path.join(__dirname, "../../src/modules/negotiations/migrations"),
  moduleOptions: { expiryDays: 14, limits: { openThreads: 3, threadsPerHour: 50, messagesPerHour: 100 } },
  testSuite: ({ service }) => {
    let container: MedusaContainer
    let events: Array<{ name: string; data: Row }>

    const customers: Record<string, Row> = {
      cus_a: {
        id: "cus_a",
        email: "a@example.com",
        first_name: "Anna",
        last_name: "Nowak",
        company_name: "Budmax",
        groups: [{ id: "cgrp_b2b", name: "B2B" }],
        addresses: [],
      },
      cus_b: {
        id: "cus_b",
        email: "b@example.com",
        first_name: "Bartosz",
        last_name: "Lis",
        company_name: null,
        groups: [],
        addresses: [],
      },
    }

    beforeEach(() => {
      events = []
      container = createMedusaContainer()
      container.register(NEGOTIATIONS_MODULE, asValue(service))
      container.register(
        ContainerRegistrationKeys.LOGGER,
        asValue({ info: () => undefined, warn: () => undefined, error: () => undefined })
      )
      container.register(
        Modules.EVENT_BUS,
        asValue({ emit: async (e: { name: string; data: Row }) => void events.push(e) })
      )
      container.register(
        ContainerRegistrationKeys.QUERY,
        asValue({
          graph: async ({ entity, filters }: Row) => {
            if (entity === "customer") return { data: customers[filters.id] ? [customers[filters.id]] : [] }
            if (entity === "variant") {
              return {
                data: [
                  {
                    id: filters.id,
                    title: "850 W",
                    sku: "WU-850",
                    product: { id: "prod_drill", title: "Drill", status: "published" },
                    calculated_price: { calculated_amount: 429, is_calculated_price_tax_inclusive: false },
                  },
                ],
              }
            }
            if (entity === "store")
              return { data: [{ supported_currencies: [{ currency_code: "pln", is_default: true }] }] }
            return { data: [] }
          },
        })
      )
    })

    const ctx = (now?: Date) => ({ container, now })
    const open = (customer = "cus_a", now?: Date) =>
      openThread(ctx(now), customer, {
        kind: "product",
        variant_id: "variant_drill",
        quantity: 40,
        target_unit_price: 36_000,
        message: "40 sztuk?",
      })

    /** A thread with a counter-offer, its last move `daysAgo` days back. */
    async function countered(daysAgo: number) {
      const started = new Date(Date.now() - daysAgo * DAY)
      const { thread } = await open("cus_a", started)
      return (
        await teamCounter(ctx(started), "user_1", thread.id, {
          version: thread.version,
          price: { mode: "unit", unit_price: 39_000 },
        })
      ).thread
    }

    it("freezes the catalog price and numbers threads without repeats, even in parallel", async () => {
      const results = await Promise.all([open("cus_a"), open("cus_b"), open("cus_b")])
      const numbers = results.map((r) => r.thread.number)
      expect(new Set(numbers).size).toBe(3)
      numbers.forEach((n) => expect(n).toMatch(/^NEG-\d{4}-\d{4}$/))
      const { thread } = results[0]
      expect(thread.catalog_total).toBe(40 * 42_900)
      expect(thread.target_total).toBe(40 * 36_000)
      expect(events.map((e) => e.name)).toContain("negotiation.created")
    })

    it("stores amounts above 32 bits", async () => {
      const { thread } = await openThread(ctx(), "cus_a", {
        kind: "product",
        variant_id: "variant_drill",
        quantity: 10_000,
        target_unit_price: 99_999_999,
      })
      expect((await service.getThread(thread.id))?.target_total).toBe(999_999_990_000)
    })

    it("acceptance and expiry at the same moment: exactly one of them happens", async () => {
      for (let i = 0; i < 6; i++) {
        const thread = await countered(14.01)
        const outcomes = await Promise.allSettled([
          customerAccept(ctx(), "cus_a", thread.id, { version: thread.version, price: thread.offer_total! }),
          service.expire({ now: new Date(), expiryDays: 14 }),
        ])
        const after = (await service.getThread(thread.id))!
        expect(["accepted", "expired"]).toContain(after.status)
        const messages = await service.listMessages(thread.id, { internal: true })
        const closing = messages.filter((m) => m.type === "acceptance" || m.type === "expiry")
        expect(closing).toHaveLength(1)
        expect(closing[0].type).toBe(after.status === "accepted" ? "acceptance" : "expiry")
        if (after.status === "expired") {
          expect(outcomes[0].status).toBe("rejected")
        }
      }
    })

    it("two people accepting at once: one wins, the other gets a conflict with the current state", async () => {
      const { thread } = await open()
      const results = await Promise.allSettled([
        teamAccept(ctx(), "user_1", thread.id, {
          version: thread.version,
          basis: "target",
          price: thread.target_total,
        }),
        teamAccept(ctx(), "user_2", thread.id, {
          version: thread.version,
          basis: "target",
          price: thread.target_total,
        }),
      ])
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
      const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult
      expect(failed.reason).toBeInstanceOf(NegotiationError)
      expect((failed.reason as NegotiationError).code).toBe("conflict")
      expect(((failed.reason as NegotiationError).state as Row).status).toBe("accepted")
      expect(events.filter((e) => e.name === "negotiation.accepted")).toHaveLength(1)
    })

    it("acceptance after the price changed is refused and returns the new price", async () => {
      const thread = await countered(0)
      const seen = { version: thread.version, price: thread.offer_total! }
      await teamCounter(ctx(), "user_1", thread.id, {
        version: thread.version,
        price: { mode: "unit", unit_price: 40_000 },
      })
      const error = await customerAccept(ctx(), "cus_a", thread.id, seen).catch((e) => e)
      expect(error).toBeInstanceOf(NegotiationError)
      expect(error.code).toBe("price_changed")
      expect(error.state.offer_total).toBe(40 * 40_000)
      expect((await service.getThread(thread.id))?.status).toBe("countered")

      // The same happens when only the version is stale.
      const fresh = (await service.getThread(thread.id))!
      const stale = await customerAccept(ctx(), "cus_a", thread.id, {
        version: fresh.version - 1,
        price: fresh.offer_total!,
      }).catch((e) => e)
      expect(stale.code).toBe("conflict")
    })

    it("a counter-offer lapses on its deadline and the thread comes back to the team", async () => {
      const { thread } = await open()
      const sent = await teamCounter(ctx(), "user_1", thread.id, {
        version: thread.version,
        price: { mode: "unit", unit_price: 39_000 },
        valid_until: new Date(Date.now() + 60_000),
      })
      const result = await sweep(container, new Date(Date.now() + 120_000))
      expect(result.lapsed).toBe(1)
      const after = (await service.getThread(sent.thread.id))!
      expect(after).toMatchObject({ status: "open", turn: "team", offer: null, offer_total: null })
      const last = (await service.listMessages(after.id, { internal: true })).at(-1)
      expect(last?.type).toBe("offer_expired")
    })

    it("internal notes change nothing the customer sees and never reach customer events", async () => {
      const { thread } = await open()
      events = []
      await teamNote(ctx(), "user_1", thread.id, { message: "Do not go below 380 zł" })
      const after = (await service.getThread(thread.id))!
      expect(after.version).toBe(thread.version)
      expect(after.last_activity_at.getTime()).toBe(thread.last_activity_at.getTime())
      const view = customerView(after, await service.listMessages(thread.id, { internal: false }), {
        expiryDays: 14,
        customerAccept: true,
        cartWriter: false,
      })
      expect(JSON.stringify(view)).not.toContain("380")
      expect(events).toHaveLength(1)
      expect(events[0].data.audience).toBe("team")
      expect(events[0].data.customer).toBeNull()
      // The customer can still accept with the version they had.
      await customerReply(ctx(), "cus_a", thread.id, { version: thread.version, message: "Any news?" })
    })

    it("messages are append-only in the database", async () => {
      const { messages } = await open()
      const error = await service
        .updateNegotiationMessages({ id: messages[0].id, body: "changed" } as never)
        .catch((e: Error) => e)
      expect(String(error)).toContain("append-only")
    })

    it("limits: open threads per customer", async () => {
      await open("cus_b")
      await open("cus_b")
      await open("cus_b")
      const error = await open("cus_b").catch((e) => e)
      expect(error).toBeInstanceOf(NegotiationError)
      expect(error.code).toBe("limit_open_threads")
    })

    it("a write is claimed once, even by parallel requests", async () => {
      const { thread } = await open()
      const claims = await Promise.all(
        Array.from({ length: 5 }, () => service.claimWrite(thread.id, "draft_order", "user_1"))
      )
      expect(claims.filter(Boolean)).toHaveLength(1)
      const winner = claims.find(Boolean)!
      await service.updateWrite(winner.id, { status: "failed", error: "test" })
      expect(await service.claimWrite(thread.id, "draft_order", "user_1")).not.toBeNull()
    })

    it("demo threads: every state, never expire, never write", async () => {
      await resetDemo(container)
      const { threads } = await service.listThreads({ is_demo: true, limit: 50 })
      expect(new Set(threads.map((t) => t.status))).toEqual(
        new Set(["open", "countered", "accepted", "rejected", "expired", "withdrawn"])
      )
      const result = await service.expire({ now: new Date(Date.now() + 365 * DAY), expiryDays: 14 })
      expect(result.expired.filter((t) => t.is_demo)).toHaveLength(0)
      expect(result.lapsed.filter((t) => t.is_demo)).toHaveLength(0)
      const accepted = threads.find((t) => t.status === "accepted")!
      const plan = await planDraftOrder(container, accepted.id)
      expect(plan.problems).toContain("demo_thread")
      expect((await service.listThreads({ is_demo: false, limit: 1 })).threads.every((t) => !t.is_demo)).toBe(true)
      // Restoring replaces them instead of adding more.
      await resetDemo(container)
      expect((await service.listThreads({ is_demo: true, limit: 50 })).count).toBe(threads.length)
    })
  },
})
