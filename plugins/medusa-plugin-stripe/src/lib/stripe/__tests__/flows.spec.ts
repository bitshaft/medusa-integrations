import type { MedusaContainer } from "@medusajs/framework/types"

import { GET as checksRoute } from "../../../api/admin/stripe/checks/route"
import { GET as disputesRoute } from "../../../api/admin/stripe/disputes/route"
import { GET as orderRoute } from "../../../api/admin/stripe/orders/[id]/route"
import { GET as overviewRoute } from "../../../api/admin/stripe/overview/route"
import { GET as paymentsRoute } from "../../../api/admin/stripe/payments/route"
import { GET as payoutRoute } from "../../../api/admin/stripe/payouts/[id]/route"
import { GET as payoutsRoute } from "../../../api/admin/stripe/payouts/route"
import { GET as statusRoute } from "../../../api/admin/stripe/status/route"
import StripeModuleService from "../../../modules/stripe/service"
import { ResponseCache } from "../cache"
import { StripeApiError } from "../client"
import { StripeReader } from "../reader"
import { runChecks } from "../server/checks"
import { ordersForIntents } from "../server/orders"
import { overview, payments } from "../server/views"

type Row = Record<string, any>
const KEY = "rk_test_51Habcdefghijklmnopqrstuvwxyz0123456789Ab12"

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })

function container(
  service: StripeModuleService,
  data: Record<string, Row[]> = {},
  extra: Record<string, unknown> = {}
) {
  const graph = async ({ entity, filters }: Row) => {
    const rows = (data[entity] ?? []).filter((row) =>
      Object.entries(filters ?? {}).every(([key, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value)) return true
        return Array.isArray(value) ? value.includes(row[key]) : row[key] === value
      })
    )
    return { data: rows }
  }
  const services: Record<string, unknown> = {
    stripe: service,
    query: { graph },
    payment: { listPaymentProviders: async () => [{ id: "pp_stripe_stripe", is_enabled: true }] },
    configModule: {
      admin: { backendUrl: "https://api.sklep.pl" },
      modules: {
        payment: {
          options: {
            providers: [{ resolve: "@medusajs/medusa/payment-stripe", id: "stripe", options: { capture: true } }],
          },
        },
      },
    },
    ...extra,
  }
  return { resolve: (key: string) => services[key] } as unknown as MedusaContainer
}

const respond = () => {
  let body: unknown
  let status = 200
  const res = {
    json: (v: unknown) => void (body = v),
    status: (s: number) => ((status = s), res),
    setHeader: () => res,
    send: (v: unknown) => void (body = v),
  }
  return { res, body: () => body as Row, status: () => status }
}

describe("startup", () => {
  it("does not stop Medusa without a key: disabled, one log line, no client", () => {
    const log = logger()
    const service = new StripeModuleService({ logger: log as never }, {})
    expect(service.isEnabled()).toBe(false)
    expect(service.disabledReason()).toBe("missing option apiKey")
    expect(service.reader()).toBeNull()
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn.mock.calls[0][0]).toMatch(/^\[stripe\] Disabled: missing option apiKey/)
  })

  it("does not stop Medusa with invalid options either", () => {
    const service = new StripeModuleService({ logger: logger() as never }, { apiKey: KEY, cacheSeconds: -5 })
    expect(service.isEnabled()).toBe(false)
    expect(service.disabledReason()).toMatch(/invalid options: cacheSeconds/)
  })

  it("never shows the key, only its kind, mode and last four characters", async () => {
    const service = new StripeModuleService({ logger: logger() as never }, { apiKey: KEY })
    const out = respond()
    await statusRoute({ scope: container(service) } as never, out.res as never)
    const text = JSON.stringify(out.body())
    expect(text).not.toContain(KEY)
    expect(text).not.toContain("abcdefgh")
    expect(out.body().key).toEqual({ kind: "restricted", mode: "test", last4: "Ab12" })
  })
})

describe("demo mode", () => {
  it("answers every view with sample data and sends nothing to Stripe", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch")
    const service = new StripeModuleService({ logger: logger() as never }, { demo: true })
    expect(service.reader()).toBeNull()
    const scope = container(service)
    const call = async (route: (req: never, res: never) => Promise<void>, query: Row, params: Row = {}) => {
      const out = respond()
      await route({ scope, validatedQuery: query, params } as never, out.res as never)
      return out.body()
    }
    expect(await call(overviewRoute, { days: 30 })).toMatchObject({ demo: true, partial: false })
    expect((await call(paymentsRoute, { days: 30, format: "json" })).payments.length).toBeGreaterThan(3)
    expect((await call(payoutsRoute, { days: 90 })).payouts).toHaveLength(3)
    expect((await call(payoutRoute, { format: "json" }, { id: "po_demo_2" })).items.length).toBeGreaterThan(0)
    expect((await call(disputesRoute, {})).disputes[0].urgent).toBe(true)
    expect((await call(checksRoute, {})).checks).toHaveLength(8)
    expect((await call(orderRoute, {}, { id: "order_1" })).payments).toHaveLength(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

/** A fake Stripe behind the real reader: answers by path, counts calls. */
function fakeReader(answers: Record<string, unknown | ((query: Row) => unknown)>) {
  const calls: string[] = []
  const client = {
    get: jest.fn(async (path: string, query: Row = {}) => {
      calls.push(path)
      const answer = answers[path]
      if (answer instanceof Error) throw answer
      if (answer === undefined) return { data: [], has_more: false }
      return typeof answer === "function" ? (answer as (q: Row) => unknown)(query) : answer
    }),
  }
  return { reader: new StripeReader(client as never, new ResponseCache(300_000)), calls, client }
}

describe("mapping payments to orders", () => {
  const service = new StripeModuleService({ logger: logger() as never }, { apiKey: KEY })
  const data = {
    payment_session: [{ id: "payses_1", payment_collection: { order: { id: "order_1", display_id: 1001 } } }],
    payment: [
      {
        id: "pay_2",
        data: { id: "pi_2" },
        provider_id: "pp_stripe_stripe",
        payment_collection: { order: { id: "order_2", display_id: 1002 } },
      },
    ],
  }

  it("finds orders by session metadata and by Medusa payments", async () => {
    const orders = await ordersForIntents(container(service, data), [
      { id: "pi_1", status: "succeeded", created: 1_700_000_000, metadata: { session_id: "payses_1" } },
      { id: "pi_2", status: "succeeded", created: 1_700_000_000, metadata: {} },
      { id: "pi_3", status: "succeeded", created: 1_700_000_000, metadata: { session_id: "payses_missing" } },
    ])
    expect(Object.fromEntries(orders)).toEqual({
      pi_1: { id: "order_1", display_id: 1001 },
      pi_2: { id: "order_2", display_id: 1002 },
    })
  })

  it("marks paid payments without an order on the payments list", async () => {
    const now = new Date("2026-11-15T12:00:00Z")
    const t = (min: number) => Math.floor(now.getTime() / 1000) - min * 60
    const { reader } = fakeReader({
      "/v1/payment_intents": {
        has_more: false,
        data: [
          {
            id: "pi_1",
            status: "succeeded",
            created: t(90),
            amount: 25500,
            currency: "pln",
            metadata: { session_id: "payses_1" },
            latest_charge: {
              status: "succeeded",
              payment_method_details: { type: "blik" },
              outcome: { risk_level: "normal" },
              balance_transaction: { fee: 585, net: 24915 },
            },
          },
          { id: "pi_3", status: "succeeded", created: t(90), amount: 1000, currency: "pln", metadata: {} },
          { id: "pi_4", status: "succeeded", created: t(5), amount: 1000, currency: "pln", metadata: {} },
          {
            id: "pi_5",
            status: "requires_payment_method",
            created: t(90),
            amount: 1000,
            currency: "pln",
            metadata: {},
            last_payment_error: {
              code: "card_declined",
              decline_code: "insufficient_funds",
              message: "Insufficient funds",
            },
          },
        ],
      },
    })
    const result = await payments(container(service, data), reader, { days: 7, now })
    const by = Object.fromEntries(result.payments.map((p) => [p.id, p]))
    expect(by.pi_1).toMatchObject({
      orphan: false,
      order: { display_id: 1001 },
      method: "blik",
      fee: 585,
      net: 24915,
      risk_level: "normal",
    })
    expect(by.pi_3.orphan).toBe(true)
    expect(by.pi_4.orphan).toBe(false) // still within the grace period
    expect(by.pi_5).toMatchObject({ orphan: false, decline: { code: "insufficient_funds" } })
    expect(by.pi_1.dashboard_url).toBe("https://dashboard.stripe.com/test/payments/pi_1")
  })
})

describe("overview", () => {
  const service = new StripeModuleService({ logger: logger() as never }, { apiKey: KEY })

  it("flags totals built from a list cut at 1000 items", async () => {
    let n = 0
    const { reader } = fakeReader({
      "/v1/balance": { available: [{ amount: 100, currency: "pln" }], pending: [{ amount: 5, currency: "eur" }] },
      "/v1/balance_transactions": (q: Row) => ({
        has_more: true,
        data: Array.from({ length: q.limit }, () => ({
          id: `txn_${n++}`,
          type: "charge",
          currency: "pln",
          amount: 1000,
          fee: 30,
          net: 970,
        })),
      }),
      "/v1/charges": {
        has_more: false,
        data: [
          {
            id: "ch_1",
            status: "succeeded",
            currency: "pln",
            amount: 1000,
            payment_method_details: { type: "card", card: {} },
          },
        ],
      },
    })
    const result = await overview(container(service), reader, { days: 30 })
    expect(result.partial).toBe(true)
    expect(result.truncated).toEqual(["balance_transactions"])
    expect(result.turnover).toEqual({ pln: 1_000_000 })
    expect(result.balance).toEqual({ available: { pln: 100 }, pending: { eur: 5 } })
    expect(result.success).toEqual({ succeeded: 1, attempts: 1, per_mille: 1000 })
  })

  it("shares one Stripe request between simultaneous views", async () => {
    const { reader, client } = fakeReader({ "/v1/balance": { available: [], pending: [] } })
    await Promise.all([
      overview(container(service), reader, { days: 7 }),
      overview(container(service), reader, { days: 7 }),
    ])
    expect(client.get.mock.calls.filter(([path]) => path === "/v1/balance")).toHaveLength(1)
  })

  it("returns partial data when Stripe is too slow", async () => {
    const slow = {
      get: jest.fn((path: string) =>
        path === "/v1/charges"
          ? new Promise(() => {})
          : Promise.resolve({ data: [], has_more: false, available: [], pending: [] })
      ),
    }
    const reader = new StripeReader(slow as never, new ResponseCache(0))
    const result = await overview(container(service), reader, { days: 7, budgetMs: 50 })
    expect(result.partial).toBe(true)
    expect(result.missed).toContain("charges")
  })
})

describe("checks against a mocked Stripe", () => {
  it("runs every check and turns a missing permission into a warning", async () => {
    const service = new StripeModuleService(
      { logger: logger() as never },
      { apiKey: KEY, storefrontDomains: ["sklep.pl"], mode: "test" }
    )
    const { reader } = fakeReader({
      "/v1/balance": { available: [], pending: [] },
      "/v1/account": new StripeApiError(403, "no permission", "invalid_request_error", null),
      "/v1/webhook_endpoints": {
        has_more: false,
        data: [
          {
            id: "we_1",
            url: "https://api.sklep.pl/hooks/payment/stripe_stripe",
            status: "enabled",
            enabled_events: ["*"],
          },
        ],
      },
      "/v1/payment_intents": { data: [{ capture_method: "automatic" }] },
    })
    const result = await runChecks(container(service), reader)
    const by = Object.fromEntries(result.checks.map((c) => [c.id, `${c.verdict}:${c.code}`]))
    expect(by).toEqual({
      provider: "ok:registered",
      api_key: "ok:restricted",
      account: "warn:no_permission",
      payment_methods: "warn:no_configuration",
      webhook: "ok:configured",
      domains: "error:missing",
      capture: "ok:matches",
      mode: "ok:matches",
    })
  })

  it("stops at an invalid key", async () => {
    const service = new StripeModuleService({ logger: logger() as never }, { apiKey: KEY, mode: "test" })
    const { reader } = fakeReader({
      "/v1/balance": new StripeApiError(401, "Invalid API Key", "invalid_request_error", null),
    })
    const result = await runChecks(container(service), reader)
    expect(result.checks.map((c) => `${c.id}:${c.verdict}:${c.code}`)).toEqual([
      "provider:ok:registered",
      "api_key:error:invalid_key",
      "mode:ok:matches",
    ])
  })

  it("works without a key and reports it", async () => {
    const service = new StripeModuleService({ logger: logger() as never }, {})
    const result = await runChecks(container(service), null)
    expect(result.checks.find((c) => c.id === "api_key")).toMatchObject({ verdict: "error", code: "missing" })
  })
})
