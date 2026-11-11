import { createHash } from "node:crypto"

import nodemailer from "nodemailer"

import { createSecretMasker } from "../kit/secrets"
import { type OutgoingEmail, TransportError } from "./types"

export type SmtpTransportOptions = {
  host: string
  /** Default 587 (STARTTLS), or 465 when `secure` is true. */
  port?: number
  /** Implicit TLS from the first byte (port 465). With false, STARTTLS is used when the server offers it. */
  secure?: boolean
  user?: string
  password?: string
  /** Fail instead of sending unencrypted when the server has no STARTTLS. Default true. */
  requireTls?: boolean
  /** Default 15 000 ms, for connecting and for every later step. */
  timeoutMs?: number
  /** Injected for tests. Defaults to nodemailer's. */
  createTransport?: (config: Record<string, unknown>) => MailTransport
}

/** The part of a nodemailer transport this module uses. */
export type MailTransport = {
  sendMail(message: Record<string, unknown>): Promise<{ messageId?: string }>
}

type SmtpError = Error & { code?: string; responseCode?: number; command?: string }

/** Errors that happen before the server accepted the message. */
const NOT_SENT_CODES = new Set([
  "EAUTH",
  "ENOAUTH",
  "EOTP",
  "EDNS",
  "ETLS",
  "EREQUIRETLS",
  "EPROXY",
  "EENVELOPE",
  "EMAXLIMIT",
  "EMAXRECIPIENTS",
])
/** SMTP steps that come before the message body is transferred. */
const BEFORE_DATA = new Set(["CONN", "EHLO", "HELO", "LHLO", "STARTTLS", "AUTH", "MAIL FROM", "RCPT TO"])

/**
 * Sends emails through an SMTP server with nodemailer. It has no Medusa
 * dependencies.
 *
 * SMTP has no idempotency keys, so this transport never retries and reports
 * `outcomeUnknown` whenever a failure may have happened after the server
 * took the message. The caller then decides not to send it again blindly.
 */
export class SmtpTransport {
  private readonly transport: MailTransport
  private readonly mask: (text: string) => string
  private readonly host: string

  constructor(options: SmtpTransportOptions) {
    const secure = options.secure ?? options.port === 465
    const timeout = options.timeoutMs ?? 15_000
    this.host = options.host
    this.mask = createSecretMasker([options.password])
    const create =
      options.createTransport ?? ((config) => nodemailer.createTransport(config) as unknown as MailTransport)
    this.transport = create({
      host: options.host,
      port: options.port ?? (secure ? 465 : 587),
      secure,
      requireTLS: !secure && (options.requireTls ?? true),
      auth: options.user ? { user: options.user, pass: options.password ?? "" } : undefined,
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
      // Email content and addresses stay out of the logs.
      logger: false,
    })
  }

  async send(email: OutgoingEmail): Promise<{ id: string }> {
    try {
      const info = await this.transport.sendMail({
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: email.replyTo,
        cc: email.cc,
        bcc: email.bcc,
        headers: email.headers,
        // A stable Message-ID lets receiving servers recognise a repeated email.
        messageId: email.idempotencyKey ? messageId(email.idempotencyKey, email.from) : undefined,
        attachments: email.attachments?.map((file) => ({
          filename: file.filename,
          content: Buffer.from(file.content, "base64"),
          contentType: file.contentType,
          contentDisposition: file.disposition === "inline" ? "inline" : "attachment",
          cid: file.contentId,
        })),
      })
      return { id: String(info?.messageId ?? "") }
    } catch (error) {
      throw this.toTransportError(error as SmtpError)
    }
  }

  private toTransportError(error: SmtpError): TransportError {
    const message = this.mask(error.message ?? String(error))
    const rejected = typeof error.responseCode === "number" && error.responseCode >= 400
    const notSent =
      rejected || NOT_SENT_CODES.has(error.code ?? "") || (error.command ? BEFORE_DATA.has(error.command) : false)

    const hint =
      error.code === "EAUTH" || error.code === "ENOAUTH"
        ? " Check the SMTP user and password."
        : error.code === "EDNS" || (error.code === "ECONNECTION" && error.command === "CONN")
          ? " Check the SMTP host and port."
          : error.code === "ETLS" || error.code === "EREQUIRETLS"
            ? ' Check the "secure" and "requireTls" options against what the server supports.'
            : ""
    return new TransportError(`SMTP server ${this.host} did not accept the email: ${message}.${hint}`, {
      outcomeUnknown: !notSent,
      cause: error,
    })
  }
}

function messageId(key: string, from: string): string {
  const domain = /@([^>\s]+)>?\s*$/.exec(from)?.[1] ?? "localhost"
  return `<${createHash("sha256").update(key).digest("hex").slice(0, 32)}@${domain}>`
}
