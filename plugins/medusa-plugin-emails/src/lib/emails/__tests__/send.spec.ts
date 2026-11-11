import { OUTCOME_UNKNOWN } from "../errors"
import { EmailsEvents } from "../events"
import { resendMessage, retryMessage, sendEmail } from "../send"
import { copyKey, GENERAL_KEY, typeKey } from "../settings"
import { BASE_OPTIONS, createTestContainer, rawOrder } from "./fixtures"

const NOW = new Date("2026-11-10T12:00:00.000Z")
const deps = { sleep: jest.fn(async () => undefined), now: () => NOW }
const confirmation = {
  type: "order-confirmation",
  data: { order_id: "order_1" },
  dedupeKey: "order-confirmation:order_1",
}

describe("sendEmail", () => {
  it("renders the email in the customer's language and hands it to the notification module", async () => {
    const test = createTestContainer()
    const result = await sendEmail(test.container, { ...confirmation, trigger: "order.placed" }, deps)

    expect(result.status).toBe("sent")
    expect(test.createNotifications).toHaveBeenCalledTimes(1)
    const notification = test.createNotifications.mock.calls[0][0]
    expect(notification).toMatchObject({
      to: "anna@example.com",
      from: "Test Shop <orders@shop.test>",
      channel: "email",
      template: "order-confirmation",
      trigger_type: "order.placed",
      resource_type: "order",
      resource_id: "order_1",
      receiver_id: "cus_1",
      provider_data: { reply_to: "help@shop.test", idempotency_key: "emails-emsg_1" },
    })
    // Polish, picked from the shipping country.
    expect(notification.content.subject).toBe("Potwierdzenie zamówienia nr 1042")
    expect(notification.content.html).toContain("https://shop.test/pl/order/order_1/confirmed")
    expect(notification.content.text).toContain("Bluza z kapturem")

    expect(test.messages[0]).toMatchObject({
      type: "order-confirmation",
      locale: "pl",
      recipient: "anna@example.com",
      status: "sent",
      subject: "Potwierdzenie zamówienia nr 1042",
      order_id: "order_1",
      customer_id: "cus_1",
      attempts: 1,
      notification_id: "noti_1",
      input: { order_id: "order_1" },
      sent_at: NOW,
    })
    expect(test.eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ name: EmailsEvents.MESSAGE_SENT, data: expect.objectContaining({ id: "emsg_1" }) })
    )
  })

  it("sends once per dedupe key, however often the event arrives", async () => {
    const test = createTestContainer()
    const first = await sendEmail(test.container, confirmation, deps)
    const second = await sendEmail(test.container, confirmation, deps)

    expect(first.status).toBe("sent")
    expect(second.status).toBe("duplicate")
    expect(test.createNotifications).toHaveBeenCalledTimes(1)
    expect(test.messages).toHaveLength(1)
  })

  it("prefers the order's own locale and an explicit one over the country", async () => {
    const test = createTestContainer({ graph: { order: [rawOrder({ locale: "en-GB" })] } })
    await sendEmail(test.container, confirmation, deps)
    expect(test.createNotifications.mock.calls[0][0].content.subject).toBe("Order #1042 confirmed")

    const forced = createTestContainer({ graph: { order: [rawOrder({ locale: "en-GB" })] } })
    await sendEmail(forced.container, { ...confirmation, locale: "pl" }, deps)
    expect(forced.createNotifications.mock.calls[0][0].content.subject).toBe("Potwierdzenie zamówienia nr 1042")
  })

  it("skips types that are switched off, unless forced", async () => {
    const test = createTestContainer({ settings: [{ key: typeKey("order-confirmation"), value: { enabled: false } }] })
    const skipped = await sendEmail(test.container, confirmation, deps)
    expect(skipped).toMatchObject({ status: "skipped", reason: expect.stringContaining("switched off") })
    expect(test.messages).toHaveLength(0)

    const forced = await sendEmail(test.container, { ...confirmation, force: true }, deps)
    expect(forced.status).toBe("sent")
  })

  it("honours types disabled in the plugin options until an admin turns them on", async () => {
    const off = createTestContainer({ options: { ...BASE_OPTIONS, disabledTypes: ["order-confirmation"] } })
    expect((await sendEmail(off.container, confirmation, deps)).status).toBe("skipped")

    const on = createTestContainer({
      options: { ...BASE_OPTIONS, disabledTypes: ["order-confirmation"] },
      settings: [{ key: typeKey("order-confirmation"), value: { enabled: true } }],
    })
    expect((await sendEmail(on.container, confirmation, deps)).status).toBe("sent")
  })

  it("uses text edited in the admin", async () => {
    const test = createTestContainer({
      settings: [
        { key: copyKey("order-confirmation"), value: { pl: { subject: "Mamy Twoje zamówienie {{order_number}}!" } } },
        { key: copyKey("common"), value: { pl: { greeting: "Hej {{first_name}}!" } } },
      ],
    })
    await sendEmail(test.container, confirmation, deps)
    const { content } = test.createNotifications.mock.calls[0][0]
    expect(content.subject).toBe("Mamy Twoje zamówienie 1042!")
    expect(content.text).toContain("Hej Anna!")
  })

  it("renders and logs without sending in demo mode", async () => {
    const test = createTestContainer({ options: { ...BASE_OPTIONS, demo: true } })
    const result = await sendEmail(test.container, confirmation, deps)

    expect(result.status).toBe("demo")
    expect(test.createNotifications).not.toHaveBeenCalled()
    expect(test.messages[0]).toMatchObject({ status: "demo", subject: "Potwierdzenie zamówienia nr 1042" })
    const line = test.logger.info.mock.calls[0][0] as string
    expect(line).toContain("[emails] Demo mode, nothing sent: order-confirmation (pl) to a***@example.com")
    expect(line).not.toContain("anna@example.com")
  })

  it("does nothing when the plugin is disabled", async () => {
    const test = createTestContainer({ options: {} })
    const result = await sendEmail(test.container, confirmation, deps)
    expect(result).toMatchObject({ status: "skipped", reason: expect.stringContaining("missing option from") })
    expect(test.createNotifications).not.toHaveBeenCalled()
  })

  it("rejects unknown email types with a hint", async () => {
    const test = createTestContainer()
    await expect(sendEmail(test.container, { type: "nope" }, deps)).rejects.toThrow(/Unknown email type "nope"/)
  })

  it("skips when the order is gone", async () => {
    const test = createTestContainer({ graph: { order: [] } })
    const result = await sendEmail(test.container, confirmation, deps)
    expect(result).toMatchObject({ status: "skipped", reason: "order order_1 was not found" })
  })

  describe("failures", () => {
    it("schedules a retry when the provider fails", async () => {
      const test = createTestContainer({ createNotifications: jest.fn().mockRejectedValue(new Error("HTTP 503")) })
      const result = await sendEmail(test.container, confirmation, deps)

      expect(result.status).toBe("failed")
      expect(result.messages[0].error).toBe("HTTP 503")
      expect(test.createNotifications).toHaveBeenCalledTimes(1)
      expect(test.messages[0]).toMatchObject({
        status: "failed",
        attempts: 1,
        retryable: true,
        next_retry_at: new Date(NOW.getTime() + 60_000),
        error: "HTTP 503",
      })
      expect(test.logger.error.mock.calls[0][0]).toContain("Next attempt in 1 min")
      expect(test.eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ name: EmailsEvents.MESSAGE_FAILED }))
    })

    it("does not retry when the provider cannot tell whether the email went out", async () => {
      const test = createTestContainer({
        createNotifications: jest.fn().mockRejectedValue(new Error(`${OUTCOME_UNKNOWN} socket closed after DATA`)),
      })
      await sendEmail(test.container, confirmation, deps)
      expect(test.messages[0]).toMatchObject({
        status: "failed",
        retryable: false,
        next_retry_at: null,
        error: "socket closed after DATA",
      })
    })

    it("retries a failed message with the same log entry and idempotency key", async () => {
      const createNotifications = jest
        .fn()
        .mockRejectedValueOnce(new Error("HTTP 503"))
        .mockResolvedValue({ id: "noti_9" })
      const test = createTestContainer({ createNotifications })
      await sendEmail(test.container, confirmation, deps)

      const result = await retryMessage(test.container, { ...test.messages[0] }, deps)
      expect(result.status).toBe("sent")
      expect(test.messages).toHaveLength(1)
      expect(test.messages[0]).toMatchObject({ status: "sent", attempts: 2, retryable: false, error: null })
      const keys = createNotifications.mock.calls.map(([notification]) => notification.provider_data.idempotency_key)
      expect(keys).toEqual(["emails-emsg_1", "emails-emsg_1"])
    })

    it("stops retrying after the configured number of attempts", async () => {
      const test = createTestContainer({
        options: { ...BASE_OPTIONS, retries: { maxAttempts: 2 } },
        createNotifications: jest.fn().mockRejectedValue(new Error("HTTP 503")),
      })
      await sendEmail(test.container, confirmation, deps)
      expect(test.messages[0].retryable).toBe(true)
      await retryMessage(test.container, { ...test.messages[0] }, deps)
      expect(test.messages[0]).toMatchObject({ attempts: 2, retryable: false, next_retry_at: null })
    })

    it("gives up on a retry when the type was switched off in the meantime", async () => {
      const test = createTestContainer({ createNotifications: jest.fn().mockRejectedValue(new Error("HTTP 503")) })
      await sendEmail(test.container, confirmation, deps)
      test.settingRows.push({ key: typeKey("order-confirmation"), value: { enabled: false } })

      const result = await retryMessage(test.container, { ...test.messages[0] }, deps)
      expect(result.status).toBe("skipped")
      expect(test.messages[0]).toMatchObject({ status: "failed", retryable: false })
    })

    it("records template errors without retrying", async () => {
      const test = createTestContainer({
        options: {
          ...BASE_OPTIONS,
          templates: {
            broken: {
              copy: { en: { subject: "Broken" } },
              component: () => {
                throw new Error("boom")
              },
            },
          },
        },
      })
      const result = await sendEmail(test.container, { type: "broken", to: "a@example.com" }, deps)
      expect(result.status).toBe("failed")
      expect(test.messages[0]).toMatchObject({ status: "failed", retryable: false, error: "boom" })
      expect(test.createNotifications).not.toHaveBeenCalled()
    })
  })

  describe("emails with secrets", () => {
    const reset = {
      type: "password-reset",
      data: { entity_id: "anna@example.com", actor_type: "customer", token: "secret-token-123" }, // check-repo: allow-secret (made-up value)
      dedupeKey: "password-reset:abc",
      sensitive: true,
    }
    const graph = { customer: [{ id: "cus_1", email: "anna@example.com", first_name: "Anna", has_account: true }] }

    it("puts the token in the link and nowhere else", async () => {
      const test = createTestContainer({ graph })
      const result = await sendEmail(test.container, reset, deps)

      expect(result.status).toBe("sent")
      const notification = test.createNotifications.mock.calls[0][0]
      expect(notification.content.html).toContain(
        "https://shop.test/reset-password?token=secret-token-123&amp;email=anna%40example.com"
      )
      expect(JSON.stringify(test.messages)).not.toContain("secret-token-123")
      expect(test.messages[0].input).toBeNull()
      expect(JSON.stringify(test.logger)).not.toContain("secret-token-123")
    })

    it("retries right away, because the token is not kept for later", async () => {
      const createNotifications = jest
        .fn()
        .mockRejectedValueOnce(new Error("HTTP 503"))
        .mockRejectedValueOnce(new Error("HTTP 503"))
        .mockResolvedValue({ id: "noti_1" })
      const test = createTestContainer({ graph, createNotifications })
      const result = await sendEmail(test.container, reset, deps)

      expect(result.status).toBe("sent")
      expect(createNotifications).toHaveBeenCalledTimes(3)
      expect(test.messages[0]).toMatchObject({ status: "sent", attempts: 3 })
    })

    it("is not retried later and cannot be resent", async () => {
      const test = createTestContainer({
        graph,
        createNotifications: jest.fn().mockRejectedValue(new Error("HTTP 503")),
      })
      await sendEmail(test.container, reset, deps)
      expect(test.messages[0]).toMatchObject({ status: "failed", attempts: 3, retryable: false })
      await expect(resendMessage(test.container, "emsg_1")).rejects.toThrow(/one-time link or code/)
    })

    it("is skipped with a hint when the reset link cannot be built", async () => {
      const test = createTestContainer({ graph, options: { from: "orders@shop.test" } })
      const result = await sendEmail(test.container, reset, deps)
      expect(result).toMatchObject({ status: "skipped", reason: expect.stringContaining('"storefrontUrl"') })
    })
  })

  describe("store team emails", () => {
    const alert = { type: "team-new-order", data: { order_id: "order_1" }, dedupeKey: "team-new-order:order_1" }

    it("go to every recipient once, in the store's default language", async () => {
      const test = createTestContainer({
        settings: [{ key: GENERAL_KEY, value: { team_recipients: ["a@shop.test", "b@shop.test"] } }],
      })
      const first = await sendEmail(test.container, alert, deps)
      const second = await sendEmail(test.container, alert, deps)

      expect(first.messages.map((message) => [message.recipient, message.status])).toEqual([
        ["a@shop.test", "sent"],
        ["b@shop.test", "sent"],
      ])
      expect(second.status).toBe("duplicate")
      expect(test.createNotifications).toHaveBeenCalledTimes(2)
      const { content } = test.createNotifications.mock.calls[0][0]
      expect(content.subject).toMatch(/^New order #1042 \(/)
      expect(content.html).toContain("https://api.shop.test/app/orders/order_1")
    })

    it("use the alert's own recipients when set", async () => {
      const test = createTestContainer({
        settings: [{ key: typeKey("team-new-order"), value: { recipients: ["orders@shop.test"] } }],
      })
      const result = await sendEmail(test.container, alert, deps)
      expect(result.messages.map((message) => message.recipient)).toEqual(["orders@shop.test"])
    })

    it("are skipped when nobody is set to receive them", async () => {
      const test = createTestContainer({ options: { from: "orders@shop.test" } })
      const result = await sendEmail(test.container, alert, deps)
      expect(result).toMatchObject({ status: "skipped", reason: expect.stringContaining("no store team recipients") })
    })
  })

  describe("attachments", () => {
    const file = { filename: "invoice.pdf", content: "JVBERi0=", content_type: "application/pdf" }

    it("come from the resolver option and from the input", async () => {
      const resolver = jest.fn(async () => [file])
      const test = createTestContainer({
        options: { ...BASE_OPTIONS, attachments: { "order-confirmation": resolver } },
      })
      await sendEmail(
        test.container,
        { ...confirmation, attachments: [{ filename: "terms.pdf", content: "AAAA" }] },
        deps
      )

      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "order-confirmation",
          order_id: "order_1",
          locale: "pl",
          to: "anna@example.com",
        })
      )
      const { attachments } = test.createNotifications.mock.calls[0][0]
      expect(attachments.map((attachment: { filename: string }) => attachment.filename)).toEqual([
        "terms.pdf",
        "invoice.pdf",
      ])
    })

    it("do not hold back the email when the resolver fails", async () => {
      const test = createTestContainer({
        options: {
          ...BASE_OPTIONS,
          attachments: () => {
            throw new Error("invoice service down")
          },
        },
      })
      const result = await sendEmail(test.container, confirmation, deps)
      expect(result.status).toBe("sent")
      expect(test.createNotifications.mock.calls[0][0].attachments).toBeUndefined()
      expect(test.logger.warn.mock.calls[0][0]).toContain("invoice service down")
    })
  })

  describe("custom email types", () => {
    const options = {
      ...BASE_OPTIONS,
      templates: {
        "abandoned-cart": {
          copy: {
            en: { subject: "You left {{count}} items behind", body: "Come back, {{first_name}}." },
            pl: { subject: "W koszyku czeka {{count}} produktów", body: "Wróć, {{first_name}}." },
          },
        },
      },
    }

    it("go through the same pipeline with their own data", async () => {
      const test = createTestContainer({ options })
      const result = await sendEmail(
        test.container,
        {
          type: "abandoned-cart",
          to: "anna@example.com",
          locale: "pl",
          data: { count: 3, customer: { first_name: "Anna" } },
          dedupeKey: "abandoned-cart:cart_1",
        },
        deps
      )
      expect(result.status).toBe("sent")
      const { content } = test.createNotifications.mock.calls[0][0]
      expect(content.subject).toBe("W koszyku czeka 3 produktów")
      expect(content.text).toContain("Wróć, Anna.")
      expect(test.messages[0].input).toEqual({ count: 3, customer: { first_name: "Anna" } })
    })
  })
})

describe("resendMessage", () => {
  it("sends a new message with the current data, even when the type is switched off", async () => {
    const test = createTestContainer()
    await sendEmail(test.container, confirmation, deps)
    test.settingRows.push({ key: typeKey("order-confirmation"), value: { enabled: false } })

    const result = await resendMessage(test.container, "emsg_1")
    expect(result.status).toBe("sent")
    expect(test.createNotifications).toHaveBeenCalledTimes(2)
    expect(test.messages[1]).toMatchObject({
      id: "emsg_2",
      recipient: "anna@example.com",
      trigger_type: "resend",
      original_message_id: "emsg_1",
      dedupe_key: null,
    })
  })

  it("explains when the email is not in the log", async () => {
    const test = createTestContainer()
    await expect(resendMessage(test.container, "emsg_404")).rejects.toThrow(/was not found in the send log/)
  })
})
