import { MedusaError } from "@medusajs/framework/utils"

import { HttpClient, type HttpResponse, HttpStatusError } from "./kit/http"
import type { KitLogger } from "./kit/secrets"

/**
 * Every Stripe path the plugin may read. Anything else is refused before a
 * request is made. There is deliberately no path that captures, refunds or
 * pays out: the official provider does that.
 */
export const ALLOWED_PATHS: ReadonlyArray<{ path: string; pattern: RegExp }> = [
  "/v1/account",
  "/v1/balance",
  "/v1/balance_transactions",
  "/v1/balance_transactions/{id}",
  "/v1/payouts",
  "/v1/payouts/{id}",
  "/v1/payment_intents",
  "/v1/payment_intents/{id}",
  "/v1/charges",
  "/v1/charges/{id}",
  "/v1/refunds",
  "/v1/disputes",
  "/v1/disputes/{id}",
  "/v1/webhook_endpoints",
  "/v1/events",
  "/v1/payment_method_domains",
  "/v1/payment_method_configurations",
].map((path) => ({ path, pattern: new RegExp(`^${path.replace("{id}", "[A-Za-z0-9_]+")}$`) }))

export class StripeReadOnlyError extends MedusaError {
  constructor(message: string) {
    super(MedusaError.Types.NOT_ALLOWED, message)
  }
}

/** Stripe refused the request (bad key, missing permission, not found…). */
export class StripeApiError extends MedusaError {
  readonly status: number
  readonly stripeType: string | null
  readonly stripeCode: string | null

  constructor(status: number, message: string, stripeType: string | null, stripeCode: string | null) {
    super(
      status === 401 || status === 403 ? MedusaError.Types.UNAUTHORIZED : MedusaError.Types.UNEXPECTED_STATE,
      `Stripe answered ${status}: ${message}`
    )
    this.status = status
    this.stripeType = stripeType
    this.stripeCode = stripeCode
  }

  /** The key is wrong or revoked. */
  get invalidKey(): boolean {
    return this.status === 401
  }

  /** A restricted key without Read permission for this resource. */
  get noPermission(): boolean {
    return this.status === 403 || this.stripeType === "permission_error"
  }
}

export type QueryValue = string | number | boolean | undefined | null | string[] | Record<string, number | string>
export type Query = Record<string, QueryValue>

/** Stripe's query syntax: `expand[]=a`, `created[gte]=1`. */
export function encodeQuery(query: Query = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) value.forEach((v) => params.append(`${key}[]`, v))
    else if (typeof value === "object")
      for (const [k, v] of Object.entries(value)) params.append(`${key}[${k}]`, String(v))
    else params.append(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ""
}

export function isAllowedPath(path: string): boolean {
  return ALLOWED_PATHS.some(({ pattern }) => pattern.test(path))
}

export type StripeClientOptions = {
  apiKey: string
  logger?: KitLogger
  /** Injected in tests. */
  fetch?: typeof fetch
  timeoutMs?: number
  apiVersion?: string
}

/** The same API version as the official Medusa Stripe provider, so objects look the same. */
export const STRIPE_API_VERSION = "2024-04-10"

/**
 * A read-only Stripe client: one HTTP method (GET) and an allow-list of
 * paths. Any other method or path throws before anything is sent. The key
 * goes only into the Authorization header and is masked in logs and errors.
 */
export class StripeReadClient {
  private readonly http: HttpClient
  private readonly apiKey: string
  private readonly apiVersion: string

  constructor(options: StripeClientOptions) {
    this.apiKey = options.apiKey
    this.apiVersion = options.apiVersion ?? STRIPE_API_VERSION
    this.http = new HttpClient({
      baseUrl: "https://api.stripe.com",
      timeoutMs: options.timeoutMs ?? 10_000,
      logPrefix: "[stripe]",
      logger: options.logger,
      secrets: [options.apiKey],
      fetch: options.fetch,
    })
  }

  /** The only way to call Stripe. `method` exists so that anything but GET is visibly refused. */
  async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    query?: Query,
    signal?: AbortSignal
  ): Promise<T> {
    if (method.toUpperCase() !== "GET") {
      throw new StripeReadOnlyError(`The Stripe plugin is read-only: ${method.toUpperCase()} is not allowed.`)
    }
    if (!isAllowedPath(path)) {
      throw new StripeReadOnlyError(`The Stripe plugin may not read ${path}: the path is not on the allow-list.`)
    }
    return this.http.request<T>({
      path: `${path}${encodeQuery(query)}`,
      method: "GET",
      idempotent: true,
      signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Stripe-Version": this.apiVersion,
      },
      parse: (response: HttpResponse) => parseStripe<T>(response, this.http.mask),
    })
  }

  get<T = Record<string, unknown>>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
    return this.request<T>("GET", path, query, signal)
  }
}

function parseStripe<T>(response: HttpResponse, mask: (text: string) => string): T {
  let body: Record<string, any> = {}
  try {
    body = response.text ? JSON.parse(response.text) : {}
  } catch {
    // not JSON; handled below
  }
  if (response.status >= 200 && response.status < 300) return body as T
  if (response.status >= 500 || response.status === 429) {
    // Retryable: the kit client retries HttpStatusError 5xx/429.
    throw new HttpStatusError(response.path, response.status, mask(response.text.slice(0, 500)))
  }
  const error = body.error ?? {}
  throw new StripeApiError(
    response.status,
    mask(String(error.message ?? `HTTP ${response.status}`)),
    error.type ?? null,
    error.code ?? null
  )
}
