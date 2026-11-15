import { checkBody, checkNewMessage, checkNewThread, checkQuantity } from "../limits"
import { NegotiationError, normalizeLocale } from "../messages"
import { DEFAULT_OPTIONS, parseOptions } from "../options"
import { readSettings } from "../settings"
import { customerView, eventPayload, NegotiationEvents } from "../views"
import { message, thread } from "./fixtures"

const ctx = { expiryDays: 14, customerAccept: true, cartWriter: true, now: new Date("2026-11-12T10:00:00Z") }

describe("what the customer sees", () => {
  const note = message({
    id: "negm_note",
    author: "team",
    author_id: "user_1",
    type: "internal_note",
    body: "Max 79 zł, margin is thin",
    internal: true,
  })
  const reply = message({ id: "negm_reply", author: "team", type: "message", body: "We can do 82 zł" })

  it("never contains internal notes, the assignee or bookkeeping", () => {
    const view = customerView(thread(), [message(), note, reply], ctx)
    const text = JSON.stringify(view)
    expect(view.messages?.map((m) => m.id)).toEqual(["negm_1", "negm_reply"])
    expect(text).not.toContain("margin is thin")
    expect(text).not.toContain("internal")
    expect(text).not.toContain("user_secret")
    expect(text).not.toContain("assignee")
    expect(text).not.toContain("search_text")
    expect(text).not.toContain("floor")
  })

  it("says what the customer can do now", () => {
    expect(customerView(thread({ status: "countered", offer: thread().target }), null, ctx).can).toEqual({
      reply: true,
      accept: true,
      withdraw: true,
      add_to_cart: false,
    })
    expect(
      customerView(thread({ status: "countered", offer: thread().target }), null, { ...ctx, customerAccept: false }).can
        .accept
    ).toBe(false)
    const accepted = thread({
      status: "accepted",
      accepted: thread().target,
      accepted_until: new Date("2026-11-20T00:00:00Z"),
    })
    expect(customerView(accepted, null, ctx).can.add_to_cart).toBe(true)
    expect(customerView(accepted, null, { ...ctx, cartWriter: false }).can.add_to_cart).toBe(false)
    expect(customerView({ ...accepted, order_id: "order_1" }, null, ctx).can.add_to_cart).toBe(false)
    expect(
      customerView({ ...accepted, accepted_until: new Date("2026-11-11T00:00:00Z") }, null, ctx).can.add_to_cart
    ).toBe(false)
  })

  it("shows a counter-offer only while it is pending", () => {
    const offer = { ...thread().target, total: 85_000 }
    expect(customerView(thread({ status: "countered", offer }), null, ctx).offer?.total).toBe(85_000)
    expect(customerView(thread({ status: "rejected", offer }), null, ctx).offer).toBeNull()
  })
})

describe("events", () => {
  it("an internal note is a team event: no customer part, the note only in the team part", () => {
    const note = message({ author: "team", type: "internal_note", body: "Do not go below 79 zł", internal: true })
    const payload = eventPayload(thread(), { actor: { type: "user", id: "user_1" }, message: note, expiryDays: 14 })
    expect(payload.audience).toBe("team")
    expect(payload.customer).toBeNull()
    expect(payload.team.note).toBe("Do not go below 79 zł")
  })

  it("a customer event carries the customer-safe view and no team bookkeeping in it", () => {
    const reply = message({ author: "team", type: "counter_offer", body: "82 zł", price: thread().target })
    const payload = eventPayload(thread(), { actor: { type: "user", id: "user_1" }, message: reply, expiryDays: 14 })
    expect(payload.audience).toBe("customer")
    expect(payload.customer?.message?.body).toBe("82 zł")
    expect(JSON.stringify(payload.customer)).not.toContain("user_secret")
    expect(payload.team.note).toBeNull()
    expect(Object.keys(payload).sort()).toEqual(
      [
        "actor",
        "audience",
        "currency_code",
        "customer",
        "customer_id",
        "id",
        "is_demo",
        "kind",
        "message_id",
        "number",
        "status",
        "team",
        "turn",
      ].sort()
    )
  })

  it("has the nine event names", () => {
    expect(Object.values(NegotiationEvents)).toHaveLength(9)
    Object.values(NegotiationEvents).forEach((name) => expect(name).toMatch(/^negotiation\.[a-z_]+$/))
  })
})

describe("limits and options", () => {
  const limits = DEFAULT_OPTIONS.limits

  it("refuse over the customer's limits", () => {
    expect(() => checkNewThread(limits, { open_threads: 10, threads_last_hour: 0, messages_last_hour: 0 })).toThrow(
      NegotiationError
    )
    expect(() => checkNewThread(limits, { open_threads: 0, threads_last_hour: 5, messages_last_hour: 0 })).toThrow(
      "per hour"
    )
    expect(() => checkNewMessage(limits, { messages_last_hour: 30 })).toThrow("per hour")
    expect(() => checkBody(limits, "x".repeat(2001))).toThrow("2000")
    expect(checkBody(limits, "   ")).toBeNull()
    expect(() => checkQuantity(limits, 10_001)).toThrow("10000")
    expect(() => checkQuantity(limits, 1.5)).toThrow()
    expect(() => checkQuantity(limits, 0)).toThrow()
  })

  it("rate limit refusals answer 429 in both languages", () => {
    const error = new NegotiationError("limit_messages_per_hour", { max: 30 })
    expect(error.httpStatus).toBe(429)
    expect(error.localized("pl")).toContain("30")
    expect(error.localized("en")).toContain("30")
    expect(new NegotiationError("price_changed").httpStatus).toBe(409)
    expect(new NegotiationError("not_signed_in").httpStatus).toBe(401)
    expect(normalizeLocale("en-US,pl;q=0.8")).toBe("en")
    expect(normalizeLocale(undefined)).toBe("pl")
  })

  it("every option has a default; writes are off", () => {
    expect(DEFAULT_OPTIONS).toMatchObject({
      expiryDays: 14,
      acceptedOfferDays: 14,
      taxInclusive: false,
      customerAccept: true,
      allowedCustomerGroups: [],
      writers: { draftOrders: false, cart: false },
      demo: false,
    })
    const zero = parseOptions({ expiryDays: 0 })
    expect(zero.enabled && zero.options.acceptedOfferDays).toBe(14)
    const custom = parseOptions({ expiryDays: 30, acceptedOfferDays: 3 })
    expect(custom.enabled && custom.options.acceptedOfferDays).toBe(3)
    expect(parseOptions({ expiryDays: -1 }).enabled).toBe(false)
    expect(readSettings({ cart_counter_modes: "nonsense" }).cart_counter_modes).toBe("both")
    expect(readSettings(null).armed).toEqual({ draft_orders: false, cart: false })
  })
})
