/**
 * Small HTTP client for integrations: timeouts, safe retries with
 * exponential backoff, and secret masking in every log line and error
 * message. It has no Medusa dependencies.
 *
 * Retries apply only to calls marked `idempotent`. A timed-out write may
 * still have succeeded on the other side, so writes are sent once; callers
 * should check the external system before trying again.
 */

import { createMaskedLogger, createSecretMasker, type KitLogger, type SecretMasker } from "./secrets"

export class HttpError extends Error {
  /** Path of the request, relative to the base URL. */
  readonly path: string

  constructor(message: string, path: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = new.target.name
    this.path = path
  }
}

/** The request never produced an HTTP response (DNS, TLS, connection reset…). */
export class HttpNetworkError extends HttpError {}

/** The request did not finish within the timeout. */
export class HttpTimeoutError extends HttpNetworkError {
  readonly timeoutMs: number

  constructor(path: string, timeoutMs: number) {
    super(`Request to ${path} timed out after ${timeoutMs} ms`, path)
    this.timeoutMs = timeoutMs
  }
}

/** The server answered with a status `parse` chose not to accept. */
export class HttpStatusError extends HttpError {
  readonly status: number
  /** First 2000 characters of the body, with secrets masked. */
  readonly body: string

  constructor(path: string, status: number, body: string) {
    super(`Request to ${path} failed with HTTP ${status}`, path)
    this.status = status
    this.body = body.slice(0, 2000)
  }
}

export type HttpResponse = {
  /** Path of the request, relative to the base URL. */
  path: string
  status: number
  headers: Headers
  text: string
}

export type HttpRequest<T> = {
  /** Appended to `baseUrl`. */
  path: string
  method?: string
  headers?: Record<string, string>
  body?: string
  /** Only idempotent calls are retried. */
  idempotent: boolean
  signal?: AbortSignal
  /**
   * Turns the raw response into a result. Runs inside the retry loop, so an
   * error thrown here can be retried when `retryOn` accepts it. Defaults to
   * `defaultParse` (JSON body, `HttpStatusError` for non-2xx).
   */
  parse?: (response: HttpResponse) => T
}

export type HttpClientOptions = {
  baseUrl: string
  /** Per attempt. Default 15 000 ms. */
  timeoutMs?: number
  /** Extra attempts for idempotent calls. Default 2. */
  maxRetries?: number
  /** Base delay for exponential backoff with jitter. Default 300 ms. */
  retryBaseDelayMs?: number
  userAgent?: string
  /** Prefix for log lines, e.g. `[apaczka]`. */
  logPrefix?: string
  logger?: KitLogger
  /** Values to mask in logs and error messages. */
  secrets?: Array<string | null | undefined>
  /**
   * Extra retry rule on top of the default (network errors, timeouts,
   * HTTP 5xx and 429).
   */
  retryOn?: (error: unknown) => boolean
  /** Injected for tests or custom HTTP stacks. Defaults to global `fetch`. */
  fetch?: typeof fetch
  /** Injected for tests. Defaults to `Date.now`. */
  now?: () => number
  /** Injected for tests. Defaults to a `setTimeout` based sleep. */
  sleep?: (ms: number) => Promise<void>
}

export class HttpClient {
  readonly baseUrl: string
  readonly mask: SecretMasker

  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number
  private readonly userAgent?: string
  private readonly logPrefix: string
  private readonly logger?: Required<KitLogger>
  private readonly retryOn?: (error: unknown) => boolean
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl
    this.mask = createSecretMasker(options.secrets ?? [])
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.maxRetries = Math.max(0, options.maxRetries ?? 2)
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 300
    this.userAgent = options.userAgent
    this.logPrefix = options.logPrefix ? `${options.logPrefix} ` : ""
    this.logger = options.logger ? createMaskedLogger(options.logger, this.mask) : undefined
    this.retryOn = options.retryOn
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? defaultSleep

    if (typeof this.fetchImpl !== "function") {
      throw new HttpError("No fetch implementation available (Node.js 18+ is required)", "")
    }
  }

  async request<T = unknown>(request: HttpRequest<T>): Promise<T> {
    const attempts = request.idempotent ? this.maxRetries + 1 : 1
    const parse = request.parse ?? (defaultParse as (response: HttpResponse) => T)

    for (let attempt = 1; ; attempt++) {
      try {
        const response = await this.send(request)
        return parse(response)
      } catch (error) {
        const retryable = isRetryableHttpError(error) || Boolean(this.retryOn?.(error))
        if (attempt >= attempts || !retryable || request.signal?.aborted) {
          throw this.maskError(error)
        }
        const delay = backoffDelay(this.retryBaseDelayMs, attempt)
        this.logger?.warn(
          `${this.logPrefix}${request.path} failed (${(error as Error).message}); retry ${attempt}/${attempts - 1} in ${delay} ms`
        )
        await this.sleep(delay)
      }
    }
  }

  private async send(request: HttpRequest<unknown>): Promise<HttpResponse> {
    const method = request.method ?? "GET"
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const onAbort = () => controller.abort()
    request.signal?.addEventListener("abort", onAbort, { once: true })

    const startedAt = this.now()
    let response: Response
    let text: string
    // The timeout and the caller's signal cover the whole attempt, body included:
    // a server can send the headers and then stall.
    try {
      response = await this.fetchImpl(this.baseUrl + request.path, {
        method,
        headers: {
          ...(this.userAgent ? { "User-Agent": this.userAgent } : {}),
          ...request.headers,
        },
        body: request.body,
        signal: controller.signal,
      })
      text = await readBody(response, controller.signal)
    } catch (error) {
      if (controller.signal.aborted && !request.signal?.aborted) {
        throw new HttpTimeoutError(request.path, this.timeoutMs)
      }
      throw new HttpNetworkError(`Request to ${request.path} failed: ${(error as Error).message}`, request.path, {
        cause: error,
      })
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener("abort", onAbort)
    }

    this.logger?.debug(
      `${this.logPrefix}${method} ${request.path} -> HTTP ${response.status} in ${this.now() - startedAt} ms`
    )
    return {
      path: request.path,
      status: response.status,
      headers: response.headers,
      text,
    }
  }

  /** Masks secrets in the message (and body) of an error before it leaves the client. */
  private maskError(error: unknown): unknown {
    if (error instanceof Error) {
      const masked = this.mask(error.message)
      if (masked !== error.message) {
        error.message = masked
      }
      const withBody = error as Error & { body?: unknown }
      if (typeof withBody.body === "string") {
        Object.defineProperty(error, "body", {
          value: this.mask(withBody.body),
        })
      }
      // The underlying error (e.g. fetch's) may be serialised by a logger too.
      if (error instanceof HttpError && error.cause !== undefined) {
        Object.defineProperty(error, "cause", { value: this.maskCause(error.cause, 3), configurable: true })
      }
    }
    return error
  }

  /** A plain copy of an error chain with secrets masked: name, message, code. */
  private maskCause(cause: unknown, depth: number): unknown {
    if (!(cause instanceof Error)) {
      return typeof cause === "string" ? this.mask(cause) : undefined
    }
    const code = (cause as Error & { code?: unknown }).code
    return {
      name: cause.name,
      message: this.mask(cause.message),
      ...(typeof code === "string" ? { code } : {}),
      ...(depth > 1 && cause.cause !== undefined ? { cause: this.maskCause(cause.cause, depth - 1) } : {}),
    }
  }
}

/** JSON body for 2xx responses, `HttpStatusError` otherwise. */
export function defaultParse(response: HttpResponse): unknown {
  if (response.status < 200 || response.status >= 300) {
    throw new HttpStatusError(response.path, response.status, response.text)
  }
  return response.text ? JSON.parse(response.text) : undefined
}

/** Network errors, timeouts, HTTP 5xx and 429 are worth another try. */
export function isRetryableHttpError(error: unknown): boolean {
  if (error instanceof HttpNetworkError) {
    return true
  }
  if (error instanceof HttpStatusError) {
    return error.status >= 500 || error.status === 429
  }
  return false
}

/** Exponential backoff with "equal jitter": between half and all of `base * 2^(attempt-1)`. */
export function backoffDelay(baseMs: number, attempt: number): number {
  const exponential = baseMs * 2 ** (attempt - 1)
  return Math.round(exponential / 2 + Math.random() * (exponential / 2))
}

/**
 * The body as text, given up when the signal aborts. Real `fetch` already
 * aborts a body read on its signal; this also covers injected fetches.
 */
function readBody(response: Response, signal: AbortSignal): Promise<string> {
  if (signal.aborted) {
    return Promise.reject(new Error("aborted"))
  }
  return new Promise<string>((resolve, reject) => {
    const onAbort = () => {
      reject(new Error("aborted"))
      response.body?.cancel().catch(() => undefined)
    }
    signal.addEventListener("abort", onAbort, { once: true })
    response.text().then(
      (text) => {
        signal.removeEventListener("abort", onAbort)
        resolve(text)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      }
    )
  })
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
