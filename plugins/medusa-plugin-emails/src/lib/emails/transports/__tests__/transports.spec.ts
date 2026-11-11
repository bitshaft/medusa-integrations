import EmailsResendProviderService from "../../../../providers/emails/resend/service"
import EmailsSmtpProviderService from "../../../../providers/emails/smtp/service"
import { OUTCOME_UNKNOWN } from "../../errors"
import { emailFromNotification, providerErrorMessage } from "../from-notification"
import { ResendClient } from "../resend"
import { type MailTransport, SmtpTransport } from "../smtp"
import { type OutgoingEmail, TransportError } from "../types"

const email: OutgoingEmail = {
  from: "Shop <orders@shop.test>",
  to: "anna@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
  text: "Hello",
  replyTo: "help@shop.test",
  attachments: [{ filename: "invoice.pdf", content: "JVBERi0=", contentType: "application/pdf" }],
  idempotencyKey: "emails-emsg_1",
}

const response = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status })

describe("ResendClient", () => {
  const client = (fetch: jest.Mock, extra: Record<string, unknown> = {}) =>
    new ResendClient({
      apiKey: "re_secret_key_123456", // check-repo: allow-secret (made-up value)
      fetch: fetch as unknown as typeof globalThis.fetch,
      sleep: async () => undefined,
      ...extra,
    })

  it("posts the email with the API key and the idempotency key", async () => {
    const fetch = jest.fn(async () => response(200, { id: "resend_1" }))
    await expect(client(fetch).send(email)).resolves.toEqual({ id: "resend_1" })

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.resend.com/emails")
    expect(init.method).toBe("POST")
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_secret_key_123456",
      "Content-Type": "application/json",
      "Idempotency-Key": "emails-emsg_1",
    })
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Shop <orders@shop.test>",
      to: ["anna@example.com"],
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
      reply_to: "help@shop.test",
      attachments: [{ filename: "invoice.pdf", content: "JVBERi0=", content_type: "application/pdf" }],
    })
  })

  it("retries server errors with the same idempotency key", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(response(503, "busy"))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValue(response(200, { id: "resend_2" }))
    await expect(client(fetch).send(email)).resolves.toEqual({ id: "resend_2" })
    expect(fetch).toHaveBeenCalledTimes(3)
    const keys = fetch.mock.calls.map(([, init]) => (init.headers as Record<string, string>)["Idempotency-Key"])
    expect(new Set(keys)).toEqual(new Set(["emails-emsg_1"]))
  })

  it("sends once when there is no idempotency key, and says the outcome is unknown", async () => {
    const fetch = jest.fn().mockRejectedValue(new Error("socket hang up"))
    const error = await client(fetch)
      .send({ ...email, idempotencyKey: undefined })
      .catch((caught) => caught)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(TransportError)
    expect(error.outcomeUnknown).toBe(true)
  })

  it("explains rejections and never leaks the API key", async () => {
    const fetch = jest.fn(async () =>
      response(403, {
        name: "validation_error",
        message: "The shop.test domain is not verified (key re_secret_key_123456)",
      })
    )
    const error = await client(fetch)
      .send(email)
      .catch((caught) => caught)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(error.message).toContain(
      "Resend rejected the email (HTTP 403 validation_error: The shop.test domain is not verified"
    )
    expect(error.message).toContain("Check the apiKey option")
    expect(error.message).not.toContain("re_secret_key_123456")
    expect(error.outcomeUnknown).toBe(false)
  })

  it("treats an idempotency conflict as an email that may already be out", async () => {
    const fetch = jest.fn(async () => response(409, { name: "invalid_idempotent_request", message: "payload differs" }))
    const error = await client(fetch)
      .send(email)
      .catch((caught) => caught)
    expect(error.outcomeUnknown).toBe(true)
  })
})

describe("SmtpTransport", () => {
  const setup = (sendMail: jest.Mock, extra: Record<string, unknown> = {}) => {
    const createTransport = jest.fn((): MailTransport => ({ sendMail }))
    const transport = new SmtpTransport({
      host: "smtp.shop.test",
      user: "mailer",
      password: "smtp-password-1",
      createTransport,
      ...extra,
    })
    return { transport, createTransport }
  }

  it("configures STARTTLS by default and implicit TLS on port 465", () => {
    const starttls = setup(jest.fn())
    expect(starttls.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.shop.test",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: "mailer", pass: "smtp-password-1" },
        connectionTimeout: 15_000,
        logger: false,
      })
    )
    const implicit = setup(jest.fn(), { port: 465 })
    expect(implicit.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true, requireTLS: false })
    )
  })

  it("sends the email with decoded attachments and a stable Message-ID", async () => {
    const sendMail = jest.fn(async () => ({ messageId: "<abc@shop.test>" }))
    const { transport } = setup(sendMail)
    await expect(transport.send(email)).resolves.toEqual({ id: "<abc@shop.test>" })
    await transport.send(email)

    const [first, second] = (sendMail.mock.calls as unknown as Array<[Record<string, any>]>).map(([message]) => message)
    expect(first).toMatchObject({ from: email.from, to: email.to, subject: "Hello", replyTo: "help@shop.test" })
    expect(first.attachments[0]).toMatchObject({
      filename: "invoice.pdf",
      contentType: "application/pdf",
      contentDisposition: "attachment",
    })
    expect(Buffer.isBuffer(first.attachments[0].content)).toBe(true)
    expect(first.messageId).toMatch(/^<[0-9a-f]{32}@shop\.test>$/)
    expect(second.messageId).toBe(first.messageId)
  })

  it.each([
    [
      "wrong password",
      { code: "EAUTH", responseCode: 535, command: "AUTH PLAIN" },
      false,
      "Check the SMTP user and password",
    ],
    ["host not found", { code: "EDNS" }, false, "Check the SMTP host and port"],
    ["connection refused", { code: "ECONNECTION", command: "CONN" }, false, "Check the SMTP host and port"],
    ["recipient rejected", { code: "EENVELOPE", responseCode: 550, command: "RCPT TO" }, false, ""],
    ["rejected after DATA", { code: "EMESSAGE", responseCode: 554, command: "DATA" }, false, ""],
    ["timeout while sending", { code: "ETIMEDOUT", command: "DATA" }, true, ""],
    ["socket closed", { code: "ESOCKET" }, true, ""],
  ])("classifies %s", async (_name, details, outcomeUnknown, hint) => {
    const sendMail = jest.fn().mockRejectedValue(Object.assign(new Error("failed with smtp-password-1"), details))
    const error = await setup(sendMail)
      .transport.send(email)
      .catch((caught) => caught)
    expect(error).toBeInstanceOf(TransportError)
    expect(error.outcomeUnknown).toBe(outcomeUnknown)
    expect(error.message).toContain("SMTP server smtp.shop.test did not accept the email")
    expect(error.message).toContain(hint)
    expect(error.message).not.toContain("smtp-password-1")
  })
})

describe("emailFromNotification", () => {
  const notification = {
    to: "anna@example.com",
    from: "orders@shop.test",
    template: "order-confirmation",
    content: { subject: "Hello", html: "<p>Hello</p>" },
    attachments: [
      { filename: "a.pdf", content: "AAAA", content_type: "application/pdf", id: "cid1", disposition: "inline" },
    ],
    provider_data: {
      reply_to: "help@shop.test",
      cc: "cc@shop.test",
      bcc: ["b@shop.test", 5],
      headers: { "X-Tag": "x", bad: 1 },
      idempotency_key: "key",
    },
  }

  it("maps a Medusa notification to an email", () => {
    expect(emailFromNotification(notification)).toEqual({
      from: "orders@shop.test",
      to: "anna@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      text: undefined,
      replyTo: "help@shop.test",
      cc: ["cc@shop.test"],
      bcc: ["b@shop.test"],
      headers: { "X-Tag": "x" },
      attachments: [
        {
          filename: "a.pdf",
          content: "AAAA",
          contentType: "application/pdf",
          disposition: "inline",
          contentId: "cid1",
        },
      ],
      idempotencyKey: "key",
    })
    expect(emailFromNotification({ ...notification, from: null }, "default@shop.test").from).toBe("default@shop.test")
  })

  it("explains what is missing", () => {
    expect(() => emailFromNotification({ ...notification, from: null })).toThrow(/has no sender/)
    expect(() => emailFromNotification({ ...notification, content: null })).toThrow(/has no rendered content/)
  })

  it("marks errors whose outcome is unknown for the pipeline", () => {
    expect(providerErrorMessage(new TransportError("timeout", { outcomeUnknown: true }))).toBe(
      `${OUTCOME_UNKNOWN} timeout`
    )
    expect(providerErrorMessage(new TransportError("rejected"))).toBe("rejected")
    expect(providerErrorMessage("plain")).toBe("plain")
  })
})

describe("providers", () => {
  const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
  const notification = { to: "a@example.com", channel: "email", template: "t", content: { subject: "s", text: "t" } }

  it("have distinct, namespaced identifiers", () => {
    expect(EmailsResendProviderService.identifier).toBe("emails-resend")
    expect(EmailsSmtpProviderService.identifier).toBe("emails-smtp")
  })

  it("stay disabled with one log line instead of stopping Medusa", async () => {
    const log = logger()
    expect(() => EmailsResendProviderService.validateOptions()).not.toThrow()
    const resend = new EmailsResendProviderService({ logger: log as never }, {})
    const smtp = new EmailsSmtpProviderService({ logger: log as never }, { port: 587 })

    expect(log.warn.mock.calls.map(([line]) => line)).toEqual([
      expect.stringContaining("[emails-resend] Disabled: missing option apiKey"),
      expect.stringContaining("[emails-smtp] Disabled: missing option host"),
    ])
    await expect(resend.send(notification)).rejects.toThrow(/emails-resend plugin is disabled: missing option apiKey/)
    await expect(smtp.send(notification)).rejects.toThrow(/emails-smtp plugin is disabled: missing option host/)
  })

  it("report a missing sender as a clear error", async () => {
    const resend = new EmailsResendProviderService({ logger: logger() as never }, { apiKey: "re_test_key_1234567890" }) // check-repo: allow-secret (made-up value)
    await expect(resend.send(notification)).rejects.toThrow(/has no sender/)
  })
})
