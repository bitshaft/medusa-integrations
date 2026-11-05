/**
 * Error hierarchy for the Apaczka API client.
 *
 * Every error thrown by the client extends `ApaczkaError`, so callers can
 * catch the whole family with one `instanceof` check and still branch on the
 * specific subclass when they need to (e.g. retry network errors, surface API
 * errors to the user).
 */

export class ApaczkaError extends Error {
  /** The API route that was called, e.g. `order_send/`. */
  readonly route?: string

  constructor(message: string, options: { route?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = new.target.name
    this.route = options.route
  }
}

/**
 * The API answered, but the envelope `status` was not 200.
 *
 * Apaczka always replies with HTTP 200; the real outcome is in the body.
 */
export class ApaczkaApiError extends ApaczkaError {
  /** Application-level status code from the response envelope. */
  readonly status: number

  constructor(status: number, message: string, route: string) {
    super(message || `Apaczka API error (status ${status})`, { route })
    this.status = status
  }

  /** True when the error is caused by wrong credentials or signature. */
  get isAuthenticationError(): boolean {
    return this.status === 401 || /signature|app_id|unauthori[sz]ed/i.test(this.message)
  }
}

/** The request never produced a usable HTTP response (DNS, TLS, reset…). */
export class ApaczkaNetworkError extends ApaczkaError {}

/** The request did not finish within the configured timeout. */
export class ApaczkaTimeoutError extends ApaczkaNetworkError {
  readonly timeoutMs: number

  constructor(route: string, timeoutMs: number) {
    super(`Apaczka request to ${route} timed out after ${timeoutMs} ms`, { route })
    this.timeoutMs = timeoutMs
  }
}

/** The response body was not the JSON envelope the API documents. */
export class ApaczkaResponseError extends ApaczkaError {
  readonly httpStatus: number
  readonly body: string

  constructor(route: string, httpStatus: number, body: string, cause?: unknown) {
    super(`Unexpected response from Apaczka for ${route} (HTTP ${httpStatus})`, { route, cause })
    this.httpStatus = httpStatus
    this.body = body.slice(0, 2000)
  }
}

/** A push-tracking webhook failed signature verification or parsing. */
export class ApaczkaWebhookError extends ApaczkaError {}
