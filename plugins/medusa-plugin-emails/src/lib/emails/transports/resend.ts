import { HttpClient, HttpStatusError } from "../kit/http"
import type { KitLogger } from "../kit/secrets"
import { type OutgoingEmail, TransportError } from "./types"

export const RESEND_BASE_URL = "https://api.resend.com"

export type ResendClientOptions = {
  apiKey: string
  /** Override the API base URL (no trailing slash). */
  baseUrl?: string
  /** Per attempt. Default 15 000 ms. */
  timeoutMs?: number
  /** Extra attempts on network errors, HTTP 5xx and 429. Default 2. */
  maxRetries?: number
  userAgent?: string
  logger?: KitLogger
  /** Injected for tests. Defaults to global `fetch`. */
  fetch?: typeof fetch
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Minimal client for Resend's "send email" endpoint, built on the kit HTTP
 * client (timeouts, retries, API key masked in logs and errors). It has no
 * Medusa dependencies.
 *
 * Requests carry an `Idempotency-Key`, which Resend honours for 24 hours:
 * repeating a request with the same key does not send a second email. That
 * is what makes retrying a timed-out request safe here.
 */
export class ResendClient {
  private readonly http: HttpClient
  private readonly apiKey: string

  constructor(options: ResendClientOptions) {
    this.apiKey = options.apiKey
    this.http = new HttpClient({
      baseUrl: (options.baseUrl ?? RESEND_BASE_URL).replace(/\/+$/, ""),
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      userAgent: options.userAgent,
      logPrefix: "[emails]",
      logger: options.logger,
      secrets: [options.apiKey],
      fetch: options.fetch,
      sleep: options.sleep,
    })
  }

  /** Sends one email and returns Resend's ID for it. */
  async send(email: OutgoingEmail): Promise<{ id: string }> {
    const body = {
      from: email.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      reply_to: email.replyTo,
      cc: email.cc?.length ? email.cc : undefined,
      bcc: email.bcc?.length ? email.bcc : undefined,
      headers: email.headers,
      attachments: email.attachments?.length
        ? email.attachments.map((file) => ({
            filename: file.filename,
            content: file.content,
            content_type: file.contentType,
            content_id: file.contentId,
          }))
        : undefined,
    }

    try {
      const response = await this.http.request<{ id?: string }>({
        path: "/emails",
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey.slice(0, 256) } : {}),
        },
        body: JSON.stringify(body),
        // Without a key a repeated request could send the email twice.
        idempotent: Boolean(email.idempotencyKey),
      })
      return { id: String(response?.id ?? "") }
    } catch (error) {
      throw toTransportError(error, Boolean(email.idempotencyKey))
    }
  }
}

function toTransportError(error: unknown, hasKey: boolean): TransportError {
  if (error instanceof HttpStatusError) {
    const details = parseBody(error.body)
    const label = [details.name, details.message].filter(Boolean).join(": ") || "no details"
    if (error.status === 409) {
      // Same idempotency key as a request that is in flight or had other
      // content: an earlier attempt for this email reached Resend.
      return new TransportError(`Resend reported an earlier attempt for this email (HTTP 409 ${label})`, {
        outcomeUnknown: true,
        cause: error,
      })
    }
    const hint =
      error.status === 401 || error.status === 403
        ? " Check the apiKey option and that the sender's domain is verified in Resend."
        : error.status === 422
          ? " Check the sender and recipient addresses."
          : ""
    return new TransportError(`Resend rejected the email (HTTP ${error.status} ${label}).${hint}`, { cause: error })
  }
  const message = error instanceof Error ? error.message : String(error)
  // A network failure without a key leaves it open whether Resend got the request.
  return new TransportError(`Could not reach Resend: ${message}`, { outcomeUnknown: !hasKey, cause: error })
}

function parseBody(body: string): { name?: string; message?: string } {
  try {
    const parsed = JSON.parse(body) as { name?: unknown; message?: unknown }
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
    }
  } catch {
    return { message: body.slice(0, 200) || undefined }
  }
}
