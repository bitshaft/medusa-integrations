import { decimal } from "../api/utils"
import { Budget } from "../budget"
import { ResponseCache } from "../cache"
import { methodGroup, methodLabel } from "../methods"
import { addAmount, mergeTotals, rate, sumBy } from "../money"
import { isOrphan, sessionIdOf } from "../orders"
import { LIST_LIMIT, StripeReader } from "../reader"
import { summarizeCharges, summarizeTransactions } from "../server/views"

describe("money", () => {
  it("sums per currency as integers and never mixes currencies", () => {
    const totals = sumBy(
      [
        { c: "pln", a: 25500 },
        { c: "PLN", a: 1 },
        { c: "eur", a: 999 },
      ],
      (x) => x.c,
      (x) => x.a
    )
    expect(totals).toEqual({ pln: 25501, eur: 999 })
    expect(mergeTotals({ pln: 1 }, { pln: 2, usd: 3 })).toEqual({ pln: 3, usd: 3 })
  })

  it("refuses amounts that are not whole minor units", () => {
    expect(() => addAmount({}, "pln", 10.5)).toThrow(/minor units|too large/)
    expect(() => addAmount({ pln: Number.MAX_SAFE_INTEGER }, "pln", 1)).toThrow(/minor units|too large/)
  })

  it("keeps rates as integers (per mille)", () => {
    expect(rate(2, 3)).toBe(667)
    expect(rate(0, 0)).toBeNull()
  })

  it("writes CSV decimals with integer arithmetic", () => {
    expect(decimal(25500, "pln")).toBe("255,00")
    expect(decimal(-4905, "pln")).toBe("-49,05")
    expect(decimal(7, "eur")).toBe("0,07")
    expect(decimal(1500, "jpy")).toBe("1500")
    expect(decimal(null, "pln")).toBe("")
  })

  it("sums balance transactions without payouts", () => {
    const sums = summarizeTransactions([
      { type: "charge", currency: "pln", amount: 10000, fee: 290, net: 9710 },
      { type: "payment", currency: "pln", amount: 5000, fee: 195, net: 4805 },
      { type: "charge", currency: "eur", amount: 2000, fee: 55, net: 1945 },
      { type: "refund", currency: "pln", amount: -3000, fee: 0, net: -3000 },
      { type: "stripe_fee", currency: "pln", amount: -500, fee: 0, net: -500 },
      { type: "payout", currency: "pln", amount: -50000, fee: 0, net: -50000 },
    ])
    expect(sums).toEqual({
      turnover: { pln: 15000, eur: 2000 },
      refunds: { pln: 3000 },
      fees: { pln: 985, eur: 55 },
      net: { pln: 11015, eur: 1945 },
    })
  })

  it("counts attempts and successes per method, wallets apart from cards", () => {
    const { success, methods } = summarizeCharges([
      { status: "succeeded", currency: "pln", amount: 100, payment_method_details: { type: "card", card: {} } },
      { status: "failed", currency: "pln", amount: 100, payment_method_details: { type: "card", card: {} } },
      {
        status: "succeeded",
        currency: "pln",
        amount: 300,
        payment_method_details: { type: "card", card: { wallet: { type: "apple_pay" } } },
      },
      { status: "succeeded", currency: "pln", amount: 50, payment_method_details: { type: "blik" } },
      { status: "succeeded", currency: "eur", amount: 70, payment_method_details: { type: "p24" } },
      { status: "succeeded", currency: "eur", amount: 10, payment_method_details: { type: "sepa_debit" } },
    ])
    expect(success).toEqual({ succeeded: 5, attempts: 6, per_mille: 833 })
    const by = Object.fromEntries(methods.map((m) => [m.method, m]))
    expect(by.card).toMatchObject({ attempts: 2, succeeded: 1, amounts: { pln: 100 } })
    expect(by.apple_pay.amounts).toEqual({ pln: 300 })
    expect(by.p24.amounts).toEqual({ eur: 70 })
    expect(by.other.attempts).toBe(1)
    expect(by.google_pay.attempts).toBe(0)
  })

  it("labels payment methods", () => {
    expect(methodLabel({ type: "card", card: { brand: "visa", last4: "4242" } })).toBe("Visa •••• 4242")
    expect(methodLabel({ type: "card", card: { brand: "visa", last4: "1", wallet: { type: "google_pay" } } })).toBe(
      "Google Pay (Visa •••• 1)"
    )
    expect(methodLabel(null, ["blik"])).toBe("BLIK")
    expect(methodGroup(null, ["p24"])).toBe("p24")
  })
})

describe("orders", () => {
  const now = new Date("2026-11-15T12:00:00Z")
  const at = (minutesAgo: number) => Math.floor(now.getTime() / 1000) - minutesAgo * 60

  it("reads the Medusa payment session from the intent metadata", () => {
    expect(sessionIdOf({ metadata: { session_id: "payses_01ABC" } })).toBe("payses_01ABC")
    expect(sessionIdOf({ metadata: { session_id: "x" } })).toBeNull()
    expect(sessionIdOf({ metadata: null })).toBeNull()
  })

  it("flags a paid payment without an order only after the grace period", () => {
    const intent = (status: string, minutesAgo: number) => ({ id: "pi_1", status, created: at(minutesAgo) })
    expect(isOrphan(intent("succeeded", 45), null, now, 30)).toBe(true)
    expect(isOrphan(intent("requires_capture", 45), null, now, 30)).toBe(true)
    expect(isOrphan(intent("succeeded", 10), null, now, 30)).toBe(false)
    expect(isOrphan(intent("succeeded", 45), { id: "order_1", display_id: 1 }, now, 30)).toBe(false)
    expect(isOrphan(intent("requires_payment_method", 45), null, now, 30)).toBe(false)
    expect(isOrphan(intent("succeeded", 45), null, now, 120)).toBe(false)
  })
})

describe("cache and request sharing", () => {
  it("reuses answers within the TTL and reads again after it", async () => {
    let now = 0
    const cache = new ResponseCache(300_000, () => now)
    const load = jest.fn(async () => ({ n: load.mock.calls.length }))
    expect(await cache.get("a", load)).toEqual({ n: 1 })
    now = 299_000
    expect(await cache.get("a", load)).toEqual({ n: 1 })
    now = 300_001
    expect(await cache.get("a", load)).toEqual({ n: 2 })
    expect(await cache.get("a", load, { fresh: true })).toEqual({ n: 3 })
  })

  it("turns several admins at once into one request", async () => {
    const cache = new ResponseCache(300_000)
    let release!: (v: number) => void
    const load = jest.fn(() => new Promise<number>((resolve) => (release = resolve)))
    const all = Promise.all([cache.get("k", load), cache.get("k", load), cache.get("k", load)])
    release(42)
    expect(await all).toEqual([42, 42, 42])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("does not cache failures and can forget keys", async () => {
    const cache = new ResponseCache(300_000)
    await expect(cache.get("x", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom")
    expect(await cache.get("x", async () => 1)).toBe(1)
    await cache.get("/v1/payment_intents/pi_1?expand", async () => 2)
    expect(cache.invalidate("pi_1")).toBe(1)
    expect(cache.invalidate()).toBe(1)
  })
})

describe("time budget and list limit", () => {
  it("returns the fallback and records the part when time runs out", async () => {
    const budget = new Budget(20)
    const slow = budget.run("charges", () => new Promise((r) => setTimeout(() => r("late"), 200)), "fallback")
    const fast = budget.run("balance", async () => "on time", "fallback")
    expect(await Promise.all([slow, fast])).toEqual(["fallback", "on time"])
    expect(budget.missed).toEqual(["charges"])
    expect(budget.partial).toBe(true)
  })

  it("skips work when the budget is already spent", async () => {
    let now = 0
    const budget = new Budget(10, () => now)
    now = 11
    const task = jest.fn(async () => 1)
    expect(await budget.run("x", task, 0)).toBe(0)
    expect(task).not.toHaveBeenCalled()
  })

  const pages = (total: number) => ({
    get: jest.fn(async (_path: string, query: Record<string, any>) => {
      const start = query.starting_after ? Number(String(query.starting_after).slice(3)) + 1 : 0
      const data = Array.from({ length: Math.min(query.limit, total - start) }, (_, i) => ({ id: `ch_${start + i}` }))
      return { data, has_more: start + data.length < total }
    }),
  })

  it("reads every page and marks lists cut at 1000 items", async () => {
    const small = pages(250)
    const reader = new StripeReader(small as never, new ResponseCache(0))
    const all = await reader.list("/v1/charges")
    expect(all).toMatchObject({ truncated: false })
    expect(all.data).toHaveLength(250)
    expect(small.get).toHaveBeenCalledTimes(3)

    const big = new StripeReader(pages(5000) as never, new ResponseCache(0))
    const cut = await big.list("/v1/charges")
    expect(cut.data).toHaveLength(LIST_LIMIT)
    expect(cut.truncated).toBe(true)
  })
})
