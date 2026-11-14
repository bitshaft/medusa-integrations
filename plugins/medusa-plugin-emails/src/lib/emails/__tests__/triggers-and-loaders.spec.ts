import { BUILT_IN_LOADERS } from "../data/loaders"
import { diffLowStock } from "../low-stock"
import { parseOptions } from "../options"
import { buildPreview } from "../preview"
import { loaderContext } from "../send"
import { emailsForEvent } from "../triggers"
import { BASE_OPTIONS, createTestContainer, rawOrder } from "./fixtures"

describe("emailsForEvent", () => {
  it("maps Medusa's events to email types with a dedupe key per resource", () => {
    const summary = (name: string, data: Record<string, unknown>) =>
      emailsForEvent(name, data).map((email) => [email.type, email.dedupeKey, email.data])

    expect(summary("order.placed", { id: "order_1" })).toEqual([
      ["order-confirmation", "order-confirmation:order_1", { order_id: "order_1" }],
      ["team-new-order", "team-new-order:order_1", { order_id: "order_1" }],
    ])
    expect(summary("order.canceled", { id: "order_1" })).toEqual([
      ["order-canceled", "order-canceled:order_1", { order_id: "order_1" }],
    ])
    expect(summary("order.return_requested", { order_id: "order_1", return_id: "ret_1" })).toEqual([
      ["return-requested", "return-requested:ret_1", { order_id: "order_1", return_id: "ret_1" }],
    ])
    expect(summary("order.return_received", { order_id: "order_1", return_id: "ret_1" })).toEqual([
      ["return-accepted", "return-accepted:ret_1", { order_id: "order_1", return_id: "ret_1" }],
    ])
    expect(summary("order.fulfillment_created", { order_id: "order_1", fulfillment_id: "ful_1" })).toEqual([
      ["order-fulfilled", "order-fulfilled:ful_1", { fulfillment_id: "ful_1", no_notification: false }],
    ])
    expect(summary("shipment.created", { id: "ful_1", no_notification: true })).toEqual([
      ["order-shipped", "order-shipped:ful_1", { fulfillment_id: "ful_1", no_notification: true }],
    ])
    expect(summary("delivery.created", { id: "ful_1" })).toEqual([
      ["order-delivered", "order-delivered:ful_1", { fulfillment_id: "ful_1", no_notification: false }],
    ])
    expect(summary("payment.captured", { id: "pay_1" })).toEqual([
      ["payment-received", "payment-received:pay_1", { payment_id: "pay_1" }],
    ])
    expect(summary("payment.refunded", { id: "pay_1" })).toEqual([
      ["refund-issued", "refund-issued:pay_1", { payment_id: "pay_1" }],
    ])
    expect(summary("customer.created", { id: "cus_1" })).toEqual([
      ["welcome", "welcome:cus_1", { customer_id: "cus_1" }],
    ])
    expect(summary("product.created", { id: "prod_1" })).toEqual([])
  })

  it("marks emails with secrets and keys them without revealing the secret", () => {
    const [reset] = emailsForEvent("auth.password_reset", { entity_id: "a@example.com", token: "secret-token" })
    const [again] = emailsForEvent("auth.password_reset", { entity_id: "a@example.com", token: "secret-token" })
    const [other] = emailsForEvent("auth.password_reset", { entity_id: "a@example.com", token: "other-token" })
    expect(reset.sensitive).toBe(true)
    expect(reset.dedupeKey).toMatch(/^password-reset:[0-9a-f]{32}$/)
    expect(reset.dedupeKey).not.toContain("secret-token")
    expect(again.dedupeKey).toBe(reset.dedupeKey)
    expect(other.dedupeKey).not.toBe(reset.dedupeKey)

    const [verification] = emailsForEvent("auth.verification_requested", { entity_id: "a@example.com", code: "123456" })
    expect(verification).toMatchObject({ type: "email-verification", sensitive: true })
    expect(verification.dedupeKey).not.toContain("123456")
  })

  it("dedupes failed payment alerts only when the payment is known", () => {
    expect(emailsForEvent("emails.payment.failed", { payment_id: "pay_1" })[0].dedupeKey).toBe(
      "team-payment-failed:pay_1"
    )
    expect(emailsForEvent("emails.payment.failed", { order_id: "order_1" })[0].dedupeKey).toBeNull()
  })
})

describe("loaders", () => {
  const parsed = parseOptions(BASE_OPTIONS)
  const options = parsed.enabled ? parsed.options : (undefined as never)
  const run = (type: string, input: Record<string, unknown>, graph: Record<string, unknown[]>, locale?: string) => {
    const { container } = createTestContainer({ graph })
    const languages = { base: "en", locales: ["en", "pl"], translation: true }
    return BUILT_IN_LOADERS[type](input, loaderContext(container, options, languages, locale))
  }

  it("builds the order view with totals that add up", async () => {
    const loaded = await run(
      "order-confirmation",
      { order_id: "order_1" },
      { order: [rawOrder({ discount_total: 10, total: 252.99 })] }
    )
    const order = loaded.data.order!
    expect(loaded).toMatchObject({ to: "anna@example.com", locale: "pl", order_id: "order_1", customer_id: "cus_1" })
    expect(order.display_id).toBe("1042")
    expect(order.items).toEqual([
      expect.objectContaining({ title: "Bluza z kapturem", subtitle: "M / Grafitowy", quantity: 1, total: 189 }),
      // "Default variant" says nothing, so it is dropped; BigNumber shapes are read.
      expect.objectContaining({ title: "Skarpety", subtitle: null, quantity: 2, total: 59 }),
    ])
    expect(order.subtotal + order.shipping_total - order.discount_total).toBeCloseTo(order.total)
    expect(order.shipping_address).toEqual([
      "Anna Nowak",
      "ul. Lipowa 12/4",
      "00-001 Warszawa",
      "Polska",
      "+48 600 100 200",
    ])
    expect(order.shipping_methods).toEqual(["Paczkomat InPost"])
    expect(loaded.data.action_url).toBe("https://shop.test/pl/order/order_1/confirmed")
  })

  it("loads the shipment with tracking and prefers the carrier's link", async () => {
    const fulfillment = {
      id: "ful_1",
      labels: [
        { tracking_number: "TRACK1", tracking_url: "https://carrier.test/TRACK1" },
        { tracking_number: "TRACK2", tracking_url: "javascript:alert(1)" },
      ],
      items: [{ title: "x", quantity: 1, line_item_id: "item_1" }],
      order: { id: "order_1" },
    }
    const loaded = await run(
      "order-shipped",
      { fulfillment_id: "ful_1" },
      { fulfillment: [fulfillment], order: [rawOrder()] }
    )
    expect(loaded.data.shipment).toEqual({
      tracking: [
        { number: "TRACK1", url: "https://carrier.test/TRACK1" },
        { number: "TRACK2", url: null },
      ],
      items: [{ title: "Bluza z kapturem", subtitle: "M / Grafitowy", quantity: 1 }],
    })
    expect(loaded.data.action_url).toBe("https://carrier.test/TRACK1")
    expect(loaded).toMatchObject({ resource_type: "fulfillment", resource_id: "ful_1", order_id: "order_1" })
  })

  it("respects fulfillments and returns created with notifications off", async () => {
    const shipped = await run("order-shipped", { fulfillment_id: "ful_1", no_notification: true }, {})
    expect(shipped.skip).toContain("notifications turned off")

    const returned = await run(
      "return-requested",
      { order_id: "order_1", return_id: "ret_1" },
      { order: [rawOrder()], return: [{ id: "ret_1", no_notification: true, items: [] }] }
    )
    expect(returned.skip).toContain("notifications turned off")
  })

  it("lists the returned items", async () => {
    const graph = {
      order: [rawOrder()],
      return: [{ id: "ret_1", items: [{ item_id: "item_2", quantity: 2, received_quantity: 1 }] }],
    }
    const requested = await run("return-requested", { order_id: "order_1", return_id: "ret_1" }, graph)
    const accepted = await run("return-accepted", { order_id: "order_1", return_id: "ret_1" }, graph)
    expect(requested.data.return?.items).toEqual([{ title: "Skarpety", subtitle: null, quantity: 2 }])
    expect(accepted.data.return?.items).toEqual([{ title: "Skarpety", subtitle: null, quantity: 1 }])
  })

  it("keys refund emails by refund, so every refund of a payment is announced", async () => {
    const payment = {
      id: "pay_1",
      amount: 262.99,
      currency_code: "pln",
      captures: [{ amount: 262.99 }],
      refunds: [
        { id: "ref_1", amount: 20, created_at: "2026-11-10T10:00:00.000Z" },
        { id: "ref_2", amount: 59, note: "Damaged", created_at: "2026-11-11T10:00:00.000Z" },
      ],
      payment_collection: { order: { id: "order_1" } },
    }
    const graph = { payment: [payment], order: [rawOrder()] }
    const refund = await run("refund-issued", { payment_id: "pay_1" }, graph)
    expect(refund.dedupe_key).toBe("refund-issued:ref_2")
    expect(refund.data.refund).toEqual({ amount: 59, currency_code: "pln", note: "Damaged" })

    const received = await run("payment-received", { payment_id: "pay_1" }, graph)
    expect(received.data.payment).toEqual({ amount: 262.99, currency_code: "pln" })

    const unlinked = await run(
      "payment-received",
      { payment_id: "pay_1" },
      { payment: [{ ...payment, payment_collection: null }] }
    )
    expect(unlinked.skip).toContain("not linked to an order")
  })

  it("welcomes registered customers only", async () => {
    const customer = {
      id: "cus_1",
      email: "anna@example.com",
      first_name: "Anna",
      has_account: true,
      metadata: { locale: "pl" },
    }
    const registered = await run("welcome", { customer_id: "cus_1" }, { customer: [customer] })
    expect(registered).toMatchObject({ to: "anna@example.com", locale: "pl", customer_id: "cus_1" })
    expect(registered.data.action_url).toBe("https://shop.test")

    const guest = await run("welcome", { customer_id: "cus_1" }, { customer: [{ ...customer, has_account: false }] })
    expect(guest.skip).toContain("guest")
  })

  it("links admin users to the admin when they reset their password", async () => {
    const loaded = await run("password-reset", { entity_id: "admin@shop.test", actor_type: "user", token: "tok" }, {})
    expect(loaded.data.action_url).toBe("https://api.shop.test/app/reset-password?token=tok&email=admin%40shop.test")
    expect(loaded.to).toBe("admin@shop.test")
    expect((await run("password-reset", { entity_id: "admin@shop.test" }, {})).skip).toContain(
      "no email address or token"
    )
  })

  it("loads verification codes for email addresses only", async () => {
    const loaded = await run(
      "email-verification",
      {
        entity_id: "anna@example.com",
        code: "123456",
        expires_at: "2026-11-10T10:00:00.000Z",
        metadata: { locale: "pl" },
      },
      {}
    )
    expect(loaded).toMatchObject({ to: "anna@example.com", locale: "pl" })
    expect(loaded.data).toMatchObject({
      code: "123456",
      expires_at: "2026-11-10T10:00:00.000Z",
      action_url: "https://shop.test/verify-email?code=123456&email=anna%40example.com",
    })
    expect((await run("email-verification", { entity_id: "+48600100200", code: "1" }, {})).skip).toContain(
      "not for an email address"
    )
  })

  it("prepares store team alerts in the default language", async () => {
    const order = await run("team-new-order", { order_id: "order_1" }, { order: [rawOrder()] })
    expect(order.locale).toBe("en")
    expect(order.data.action_url).toBe("https://api.shop.test/app/orders/order_1")

    const stock = await run("team-low-stock", { threshold: 5, items: [{ title: "Hoodie", available: 2 }] }, {})
    expect(stock.data.low_stock).toEqual({ threshold: 5, items: [{ title: "Hoodie", available: 2 }] })
    expect((await run("team-low-stock", { threshold: 5, items: [] }, {})).skip).toBeDefined()

    const failed = await run(
      "team-payment-failed",
      { amount: 99, currency_code: "pln", reason: "Declined", customer_email: "a@example.com" },
      {}
    )
    expect(failed.to).toBeNull()
    expect(failed.data.failure).toMatchObject({
      amount: 99,
      currency_code: "pln",
      reason: "Declined",
      customer_email: "a@example.com",
    })

    const withOrder = await run("team-payment-failed", { order_id: "order_1" }, { order: [rawOrder()] })
    expect(withOrder.data.failure).toMatchObject({ amount: 262.99, customer_email: "anna@example.com" })
    expect(withOrder.order_id).toBe("order_1")
  })
})

describe("buildPreview", () => {
  const parsed = parseOptions(BASE_OPTIONS)
  const options = parsed.enabled ? parsed.options : (undefined as never)

  it("uses the newest real order", async () => {
    const { container } = createTestContainer({ graph: { order: [rawOrder()] } })
    const preview = await buildPreview(container, options, { type: "order-shipped", locale: "en" })
    expect(preview.order).toEqual({ id: "order_1", display_id: "1042" })
    expect(preview.loaded.data.order?.items[0].title).toBe("Bluza z kapturem")
    expect(preview.loaded.data.shipment?.tracking).toHaveLength(1)
  })

  it("falls back to a sample order and never shows a real secret", async () => {
    const { container } = createTestContainer({ graph: { order: [] } })
    const preview = await buildPreview(container, options, { type: "password-reset", locale: "pl" })
    expect(preview.order).toBeNull()
    expect(preview.loaded.data.action_url).toContain("token=preview-token")

    const team = await buildPreview(container, options, { type: "team-low-stock", locale: "en" })
    expect(team.loaded.to).toBeNull()
    expect(team.loaded.data.low_stock?.items.length).toBeGreaterThan(0)
  })

  it("uses the preview data of custom templates", async () => {
    const custom = parseOptions({
      ...BASE_OPTIONS,
      templates: {
        "abandoned-cart": { copy: { en: { subject: "Hi" } }, previewData: (locale: string) => ({ count: 3, locale }) },
      },
    })
    const { container } = createTestContainer()
    const preview = await buildPreview(container, custom.enabled ? custom.options : (undefined as never), {
      type: "abandoned-cart",
      locale: "pl",
    })
    expect(preview.loaded.data).toEqual({ count: 3, locale: "pl" })
  })
})

describe("diffLowStock", () => {
  const level = (item: string, available: number, location = "loc_1") => ({
    inventory_item_id: item,
    location_id: location,
    available,
    title: item,
    sku: null,
    location: null,
  })

  it("alerts once per item and again after a restock", () => {
    const levels = [level("a", 2), level("b", 5), level("c", 6), level("d", 0)]
    const first = diffLowStock(levels, [], 5)
    expect(first.toAlert.map((entry) => entry.inventory_item_id)).toEqual(["d", "a", "b"])
    expect(first.toClear).toEqual([])

    const alerts = [
      { id: "al_a", inventory_item_id: "a", location_id: "loc_1" },
      { id: "al_b", inventory_item_id: "b", location_id: "loc_1" },
      { id: "al_gone", inventory_item_id: "gone", location_id: "loc_1" },
    ]
    const second = diffLowStock([level("a", 1), level("b", 20), level("d", 0)], alerts, 5)
    expect(second.toAlert.map((entry) => entry.inventory_item_id)).toEqual(["d"])
    // b was restocked and "gone" no longer exists: both can alert again later.
    expect(second.toClear).toEqual(["al_b", "al_gone"])
  })

  it("treats locations separately", () => {
    const result = diffLowStock(
      [level("a", 1, "loc_1"), level("a", 1, "loc_2")],
      [{ id: "al_1", inventory_item_id: "a", location_id: "loc_1" }],
      5
    )
    expect(result.toAlert.map((entry) => entry.location_id)).toEqual(["loc_2"])
  })
})
