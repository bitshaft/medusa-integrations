import { CLAIM_STALE_MS, runCheck, scheduleChecks } from "../engine"
import { BackInStockEvents } from "../events"
import { CHANNEL, createEngine, PAIR, type TestEngine, VARIANT } from "./fixtures"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Schedules a check, lets the delay pass and runs it, as the event bus would. */
async function restockCycle(engine: TestEngine) {
  await scheduleChecks(engine, [PAIR])
  const check = [...engine.store.checks.values()][0]
  engine.advance(5 * MINUTE)
  return runCheck(engine, check.id)
}

describe("scheduleChecks", () => {
  it("creates one delayed check per variant and sales channel", async () => {
    const engine = createEngine()
    await scheduleChecks(engine, [PAIR, { variant_id: VARIANT, sales_channel_id: "sc_2" }])
    expect(engine.store.checks.size).toBe(2)
    expect(engine.emitted).toEqual([
      { name: BackInStockEvents.CHECK_DUE, data: { id: expect.any(String) }, delayMs: 5 * MINUTE },
      { name: BackInStockEvents.CHECK_DUE, data: { id: expect.any(String) }, delayMs: 5 * MINUTE },
    ])
  })

  it("collapses repeated events and keeps the first due time", async () => {
    const engine = createEngine()
    await scheduleChecks(engine, [PAIR])
    const [check] = [...engine.store.checks.values()]
    engine.advance(2 * MINUTE)
    await scheduleChecks(engine, [PAIR, PAIR])
    expect(engine.store.checks.size).toBe(1)
    expect(engine.emitted).toHaveLength(1)
    expect([...engine.store.checks.values()][0].due_at).toEqual(check.due_at)
  })
})

describe("runCheck", () => {
  it("notifies every active subscription on a change from out of stock to in stock", async () => {
    const engine = createEngine()
    const first = engine.store.addSubscription()
    const second = engine.store.addSubscription({ locale: "en", country_code: "de" })
    engine.store.addSubscription({ status: "pending" })
    engine.store.addSubscription({ status: "unsubscribed" })
    engine.store.addSubscription({ sales_channel_id: "sc_other" })
    engine.setStock(3)

    const outcome = await restockCycle(engine)

    expect(outcome).toMatchObject({ status: "done", in_stock: true, restocked: true, notified: 2, failed: 0 })
    expect(engine.deliveries.map((delivery) => delivery.to)).toEqual([first.email, second.email])
    const [polish, english] = engine.deliveries
    expect(polish).toMatchObject({
      demo: false,
      one_click_unsubscribe: true,
      view: {
        kind: "restock",
        locale: "pl",
        product_label: "Hoodie · M",
        action_url: "https://shop.test/pl/products/hoodie",
        unsubscribe_url: expect.stringMatching(
          /^https:\/\/api\.shop\.test\/hooks\/back-in-stock\/unsubscribe\/token-\d+$/
        ),
      },
    })
    expect(english.view).toMatchObject({
      locale: "en",
      locale_code: "en",
      action_url: "https://shop.test/de/products/hoodie",
    })
    expect(polish.view.locale_code).toBe("pl")
    // Every email gets its own unsubscribe token.
    expect(new Set(engine.store.tokens.map((token) => token.token)).size).toBe(2)

    expect(engine.store.subscriptions.find((row) => row.id === first.id)).toMatchObject({
      notification_count: 1,
      status: "active",
    })
    expect(engine.store.checks.size).toBe(0)
    expect(engine.store.states.get(`${VARIANT}|${CHANNEL}`)).toMatchObject({ in_stock: true, available: 3 })
    expect(engine.emitted.map((event) => event.name)).toEqual([
      BackInStockEvents.CHECK_DUE,
      BackInStockEvents.RESTOCKED,
      BackInStockEvents.NOTIFIED,
      BackInStockEvents.NOTIFIED,
    ])
    expect(engine.emitted[1].data).toEqual({ ...PAIR, available: 3, waiting: 2 })
  })

  it("sends nothing when a stock entry is corrected within the delay", async () => {
    const engine = createEngine()
    engine.store.addSubscription()
    // The event came from a mistake; by the time the check runs, stock is back to zero.
    engine.setStock(0)
    const outcome = await restockCycle(engine)
    expect(outcome).toMatchObject({ status: "done", restocked: false, notified: 0 })
    expect(engine.deliveries).toHaveLength(0)
    expect(engine.store.checks.size).toBe(0)
  })

  it("sends nothing while the variant stays in stock, and again after it sold out and came back", async () => {
    const engine = createEngine({ options: { settings: { minGapHours: 0 } } })
    engine.store.addSubscription()
    engine.setStock(5)
    await restockCycle(engine)
    expect(engine.deliveries).toHaveLength(1)

    engine.setStock(4)
    await restockCycle(engine)
    expect(engine.deliveries).toHaveLength(1)

    engine.setStock(0)
    await restockCycle(engine)
    engine.setStock(2)
    await restockCycle(engine)
    expect(engine.deliveries).toHaveLength(2)
  })

  it("respects the minimum gap between emails", async () => {
    const engine = createEngine()
    engine.store.addSubscription()
    engine.setStock(5)
    await restockCycle(engine)
    engine.setStock(0)
    await restockCycle(engine)
    engine.advance(HOUR)
    engine.setStock(5)
    await restockCycle(engine)
    expect(engine.deliveries).toHaveLength(1)

    engine.setStock(0)
    await restockCycle(engine)
    engine.advance(24 * HOUR)
    engine.setStock(5)
    await restockCycle(engine)
    expect(engine.deliveries).toHaveLength(2)
  })

  it("stops at the maximum number of emails", async () => {
    const engine = createEngine({ options: { settings: { minGapHours: 0, maxNotifications: 2 } } })
    const subscription = engine.store.addSubscription()
    for (let round = 0; round < 4; round++) {
      engine.setStock(0)
      await restockCycle(engine)
      engine.setStock(5)
      await restockCycle(engine)
    }
    expect(engine.deliveries).toHaveLength(2)
    expect(engine.store.subscriptions.find((row) => row.id === subscription.id)?.notification_count).toBe(2)
  })

  it("uses the minimum quantity", async () => {
    const engine = createEngine({ options: { settings: { minQuantity: 3 } } })
    engine.store.addSubscription()
    engine.setStock(2)
    expect(await restockCycle(engine)).toMatchObject({ in_stock: false, notified: 0 })
    engine.setStock(3)
    expect(await restockCycle(engine)).toMatchObject({ in_stock: true, notified: 1 })
  })

  it("treats variants without stock management or with backorders as available", async () => {
    const engine = createEngine()
    engine.store.addSubscription()
    engine.setStock(null, { in_stock: true, reason: "untracked" })
    expect(await restockCycle(engine)).toMatchObject({ restocked: true, notified: 1 })
  })

  it("does not count failed emails, so the next restock tries again", async () => {
    let fail = true
    const engine = createEngine({
      options: { settings: { minGapHours: 0 } },
      deliver: async () =>
        fail ? { status: "failed", via: "notification", error: "HTTP 503" } : { status: "sent", via: "notification" },
    })
    const subscription = engine.store.addSubscription()
    engine.setStock(5)
    expect(await restockCycle(engine)).toMatchObject({ notified: 0, failed: 1 })
    expect(engine.store.subscriptions[0].notification_count).toBe(0)
    expect(engine.store.notifications[0]).toMatchObject({
      subscription_id: subscription.id,
      status: "failed",
      error: "HTTP 503",
    })
    expect(engine.logger.warn).toHaveBeenCalled()

    fail = false
    engine.setStock(0)
    await restockCycle(engine)
    engine.setStock(5)
    expect(await restockCycle(engine)).toMatchObject({ notified: 1 })
  })

  it("never sends twice to a subscription with an email in flight", async () => {
    const engine = createEngine()
    const subscription = engine.store.addSubscription()
    await engine.store.claimNotification(subscription, "restock", 1)
    engine.setStock(5)
    expect(await restockCycle(engine)).toMatchObject({ restocked: true, notified: 0 })
    expect(engine.deliveries).toHaveLength(0)
  })

  it("renders and logs only in demo mode and for demo subscriptions", async () => {
    const engine = createEngine({ options: { demo: true } })
    engine.store.addSubscription()
    engine.setStock(5)
    await restockCycle(engine)
    expect(engine.deliveries[0].demo).toBe(true)

    const real = createEngine()
    real.store.addSubscription({ demo: true })
    real.store.addSubscription()
    real.setStock(5)
    await restockCycle(real)
    expect(real.deliveries.map((delivery) => delivery.demo)).toEqual([true, false])
  })

  describe("claims", () => {
    it("lets only one worker run a check", async () => {
      const engine = createEngine()
      await scheduleChecks(engine, [PAIR])
      const [check] = [...engine.store.checks.values()]
      engine.advance(5 * MINUTE)
      await engine.store.claimCheck(check.id, engine.now!(), new Date(engine.now!().getTime() - CLAIM_STALE_MS))
      expect(await runCheck(engine, check.id)).toEqual({ status: "busy" })
    })

    it("takes over a stale claim from a worker that stopped", async () => {
      const engine = createEngine()
      engine.store.addSubscription()
      engine.setStock(5)
      await scheduleChecks(engine, [PAIR])
      const [check] = [...engine.store.checks.values()]
      engine.advance(5 * MINUTE)
      await engine.store.claimCheck(check.id, engine.now!(), new Date(0))
      engine.advance(CLAIM_STALE_MS + 1)
      expect(await runCheck(engine, check.id)).toMatchObject({ status: "done", notified: 1 })
    })

    it("still notifies the rest after a worker stopped mid-sending, and nobody twice", async () => {
      const engine = createEngine({ options: { settings: { minGapHours: 0 } } })
      const [first, second, third] = [
        engine.store.addSubscription(),
        engine.store.addSubscription(),
        engine.store.addSubscription(),
      ]
      engine.setStock(5)
      const complete = engine.store.completeNotification.bind(engine.store)
      let calls = 0
      engine.store.completeNotification = async (...args) => {
        if (++calls === 2) throw new Error("worker killed")
        return complete(...args)
      }
      await expect(restockCycle(engine)).rejects.toThrow("worker killed")
      expect(engine.deliveries.map((delivery) => delivery.to)).toEqual([first.email, second.email])

      const [check] = [...engine.store.checks.values()]
      engine.advance(CLAIM_STALE_MS + 1)
      expect(await runCheck(engine, check.id)).toMatchObject({ status: "done", restocked: true, notified: 1 })
      // The first was emailed, the second may have been (its email is still in flight): only the third gets one now.
      expect(engine.deliveries.map((delivery) => delivery.to)).toEqual([first.email, second.email, third.email])
      expect(engine.store.states.get(`${VARIANT}|${CHANNEL}`)).toMatchObject({ in_stock: true })
    })

    it("closes the email as failed when building it fails, so it is tried at the next restock", async () => {
      const engine = createEngine({ options: { settings: { minGapHours: 0 } } })
      engine.store.addSubscription()
      engine.setStock(5)
      const issue = engine.store.issueToken.bind(engine.store)
      engine.store.issueToken = async () => {
        throw new Error("database is down")
      }
      expect(await restockCycle(engine)).toMatchObject({ notified: 0, failed: 1 })
      expect(engine.store.notifications[0]).toMatchObject({ status: "failed", error: "database is down" })

      engine.store.issueToken = issue
      engine.setStock(0)
      await restockCycle(engine)
      engine.setStock(5)
      expect(await restockCycle(engine)).toMatchObject({ notified: 1 })
    })

    it("keeps the row when the check fails, so it can be run again", async () => {
      const engine = createEngine()
      engine.availability = async () => {
        throw new Error("database is down")
      }
      await scheduleChecks(engine, [PAIR])
      const [check] = [...engine.store.checks.values()]
      engine.advance(5 * MINUTE)
      await expect(runCheck(engine, check.id)).rejects.toThrow("database is down")
      expect(engine.store.checks.get(check.id)?.claimed_at).not.toBeNull()
    })

    it("waits when the timer fires too early", async () => {
      const engine = createEngine()
      await scheduleChecks(engine, [PAIR])
      const [check] = [...engine.store.checks.values()]
      engine.advance(MINUTE)
      expect(await runCheck(engine, check.id)).toEqual({ status: "early" })
      expect(engine.emitted.at(-1)).toEqual({
        name: BackInStockEvents.CHECK_DUE,
        data: { id: check.id },
        delayMs: 4 * MINUTE,
      })
    })

    it("checks again when stock changed while the check was running", async () => {
      const engine = createEngine()
      await scheduleChecks(engine, [PAIR])
      const [check] = [...engine.store.checks.values()]
      engine.advance(5 * MINUTE)
      const original = engine.availability
      engine.availability = async (...args) => {
        engine.advance(1000)
        await scheduleChecks(engine, [PAIR])
        return original(...args)
      }
      expect(await runCheck(engine, check.id)).toMatchObject({ status: "done", rescheduled: true })
      expect(engine.store.checks.get(check.id)).toMatchObject({ claimed_at: null, dirty_at: null })
      expect(engine.emitted.at(-1)).toMatchObject({ name: BackInStockEvents.CHECK_DUE, delayMs: 5 * MINUTE })
    })

    it("ignores a check that was already done", async () => {
      expect(await runCheck(createEngine(), "bichk_missing")).toEqual({ status: "missing" })
    })
  })

  describe("simulated restock (demo)", () => {
    it("reaches demo subscriptions only, without a stock change and outside the gap", async () => {
      const engine = createEngine()
      const demo = engine.store.addSubscription({ demo: true, last_notified_at: new Date() })
      engine.store.addSubscription()
      engine.setStock(0)
      const { check } = await engine.store.upsertCheck(PAIR, engine.now!(), engine.now!(), true)
      expect(await runCheck(engine, check.id)).toMatchObject({ status: "done", restocked: false, notified: 1 })
      expect(engine.deliveries).toEqual([expect.objectContaining({ to: demo.email, demo: true })])
      expect(engine.emitted.map((event) => event.name)).not.toContain(BackInStockEvents.RESTOCKED)
    })
  })
})
