import { ApaczkaApiError, ApaczkaError, ApaczkaNetworkError, ApaczkaResponseError, ApaczkaTimeoutError } from "./errors"
import { signRequest } from "./signing"
import type {
  ApaczkaBatchPickupPayload,
  ApaczkaDispatchCode,
  ApaczkaEnvelope,
  ApaczkaEnvironment,
  ApaczkaOrderDetails,
  ApaczkaOrderInput,
  ApaczkaOrderSummary,
  ApaczkaOrdersListPayload,
  ApaczkaPickupHours,
  ApaczkaPickupHoursDay,
  ApaczkaPickupHoursPayload,
  ApaczkaPickupPayload,
  ApaczkaPickupResult,
  ApaczkaPoint,
  ApaczkaPointsPayload,
  ApaczkaPointsResponse,
  ApaczkaService,
  ApaczkaServiceStructure,
  ApaczkaTracking,
  ApaczkaTurnIn,
  ApaczkaValuation,
  ApaczkaWaybill,
} from "./types"

export const APACZKA_BASE_URLS: Record<ApaczkaEnvironment, string> = {
  production: "https://www.apaczka.pl/api/v2/",
  sandbox: "https://panel-sandbox.apaczka.pl/api/v2/",
}

/** Minimal logger shape; Medusa's logger and `console` both satisfy it. */
export type ApaczkaLogger = {
  debug?: (message: string) => void
  warn: (message: string) => void
}

export type ApaczkaClientOptions = {
  appId: string
  appSecret: string
  /** Defaults to `production`. Ignored when `baseUrl` is set. */
  environment?: ApaczkaEnvironment
  /** Override the API base URL (must end with `/api/v2/`). */
  baseUrl?: string
  /** Per-request timeout. Default 15 000 ms. */
  timeoutMs?: number
  /**
   * Retries for read-only calls on network errors, timeouts and HTTP 5xx/429.
   * Write calls (`order_send`, `cancel_order`, `pickup`, `batch_pickup`) are
   * never retried: a timed-out write may still have succeeded, and retrying
   * `order_send` can create a duplicate order. Default 2.
   */
  maxRetries?: number
  /** Base delay for exponential backoff. Default 300 ms. */
  retryBaseDelayMs?: number
  /** Sent as `User-Agent` so Apaczka can identify the integration. */
  userAgent?: string
  logger?: ApaczkaLogger
  /** Injected for tests or custom HTTP stacks. Defaults to global `fetch`. */
  fetch?: typeof fetch
  /** Injected for tests. Defaults to `Date.now`. */
  now?: () => number
}

type CallOptions = {
  /** Only read operations may be retried safely. */
  idempotent: boolean
  signal?: AbortSignal
}

/**
 * Typed client for the Apaczka API v2.
 *
 * Handles HMAC request signing, the "HTTP 200 for everything" envelope,
 * timeouts and safe retries. It has no Medusa dependencies and can be used
 * on its own.
 */
export class ApaczkaClient {
  readonly baseUrl: string
  readonly environment: ApaczkaEnvironment | "custom"

  private readonly appId: string
  private readonly appSecret: string
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number
  private readonly userAgent: string
  private readonly logger?: ApaczkaLogger
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number

  constructor(options: ApaczkaClientOptions) {
    if (!options.appId || !options.appSecret) {
      throw new ApaczkaError("Apaczka appId and appSecret are required")
    }

    this.appId = options.appId
    this.appSecret = options.appSecret
    this.environment = options.baseUrl ? "custom" : (options.environment ?? "production")
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? APACZKA_BASE_URLS[options.environment ?? "production"])
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.maxRetries = Math.max(0, options.maxRetries ?? 2)
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 300
    this.userAgent = options.userAgent ?? "apaczka-node-client"
    this.logger = options.logger
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.now = options.now ?? Date.now

    if (typeof this.fetchImpl !== "function") {
      throw new ApaczkaError("No fetch implementation available (Node.js 18+ is required)")
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Dictionary                                                              */
  /* ---------------------------------------------------------------------- */

  /** Services, options, package types and pickup types available to the account. */
  getServiceStructure(signal?: AbortSignal): Promise<ApaczkaServiceStructure> {
    return this.call("service_structure/", {}, { idempotent: true, signal })
  }

  /** Parcel points (lockers, PUDO) of one type, e.g. `INPOST`. */
  async getPoints(type: string, payload: ApaczkaPointsPayload = {}, signal?: AbortSignal): Promise<ApaczkaPoint[]> {
    const response = await this.call<ApaczkaPointsResponse>(
      `points/${encodeURIComponent(type)}/`,
      { country_code: "PL", subtype: "", ...payload },
      { idempotent: true, signal }
    )
    return toArray(response?.points)
  }

  /* ---------------------------------------------------------------------- */
  /* Orders                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Prices an order without creating it. Omit `service_id` to price across
   * every service able to carry the parcel. Amounts are in grosze.
   */
  valuateOrder(order: ApaczkaOrderInput, signal?: AbortSignal): Promise<ApaczkaValuation> {
    return this.call("order_valuation/", { order }, { idempotent: true, signal })
  }

  /**
   * Creates a shipment order. Not idempotent and never retried — on a
   * timeout, check `listOrders` before trying again.
   */
  async sendOrder(order: ApaczkaOrderInput, signal?: AbortSignal): Promise<ApaczkaOrderSummary> {
    const response = await this.call<{ order: ApaczkaOrderSummary }>(
      "order_send/",
      { order },
      { idempotent: false, signal }
    )
    return response.order
  }

  async getOrder(orderId: number | string, signal?: AbortSignal): Promise<ApaczkaOrderDetails> {
    const response = await this.call<{ order: ApaczkaOrderDetails }>(
      `order/${orderId}/`,
      {},
      { idempotent: true, signal }
    )
    return response.order
  }

  /** Paginated order list (the API allows at most 25 per page). */
  async listOrders(payload: ApaczkaOrdersListPayload = {}, signal?: AbortSignal): Promise<ApaczkaOrderSummary[]> {
    const response = await this.call<{ orders: ApaczkaOrderSummary[] }>(
      "orders/",
      { page: payload.page ?? 1, limit: Math.min(payload.limit ?? 25, 25) },
      { idempotent: true, signal }
    )
    return toArray(response?.orders)
  }

  /** Cancels an order while the carrier has not taken over the parcel yet. */
  async cancelOrder(orderId: number | string, signal?: AbortSignal): Promise<void> {
    await this.call(`cancel_order/${orderId}/`, {}, { idempotent: false, signal })
  }

  /* ---------------------------------------------------------------------- */
  /* Documents                                                               */
  /* ---------------------------------------------------------------------- */

  /** Shipping label, base64-encoded (PDF, or ZPL when ordered with `is_zebra`). */
  getWaybill(orderId: number | string, signal?: AbortSignal): Promise<ApaczkaWaybill> {
    return this.call(`waybill/${orderId}/`, {}, { idempotent: true, signal })
  }

  /** Drop-off code some carriers require at the point. `dispatch_code` may be null. */
  getDispatchCode(orderId: number | string, signal?: AbortSignal): Promise<ApaczkaDispatchCode> {
    return this.call(`dispatch_code/${orderId}/`, {}, { idempotent: true, signal })
  }

  /** Collective hand-over (turn-in) confirmation for several orders, base64 PDF. */
  getTurnIn(orderIds: Array<number | string>, signal?: AbortSignal): Promise<ApaczkaTurnIn> {
    return this.call("turn_in/", { order_ids: orderIds.map(Number) }, { idempotent: true, signal })
  }

  /* ---------------------------------------------------------------------- */
  /* Pickups                                                                 */
  /* ---------------------------------------------------------------------- */

  /** Available courier pickup days for a postal code and service. */
  async getPickupHours(
    payload: ApaczkaPickupHoursPayload,
    signal?: AbortSignal
  ): Promise<{ postal_code: string; days: ApaczkaPickupHoursDay[] }> {
    const response = await this.call<ApaczkaPickupHours>("pickup_hours/", payload, { idempotent: true, signal })
    return { postal_code: response.postal_code, days: toArray(response.hours) }
  }

  /** Orders a courier pickup for an existing order (needs the "pickup via API" privilege). */
  orderPickup(
    orderId: number | string,
    payload: ApaczkaPickupPayload,
    signal?: AbortSignal
  ): Promise<ApaczkaPickupResult> {
    return this.call(`pickup/${orderId}/`, payload, { idempotent: false, signal })
  }

  /** One courier pickup for several orders with the same sender and service. */
  batchPickup(payload: ApaczkaBatchPickupPayload, signal?: AbortSignal): Promise<ApaczkaPickupResult> {
    return this.call(
      "batch_pickup/",
      { ...payload, order_ids: payload.order_ids.map(Number) },
      { idempotent: false, signal }
    )
  }

  /* ---------------------------------------------------------------------- */
  /* Tracking                                                                */
  /* ---------------------------------------------------------------------- */

  /** Tracking history by carrier waybill number, newest first. */
  async getTracking(waybillNumber: string, signal?: AbortSignal): Promise<ApaczkaTracking> {
    const response = await this.call<ApaczkaTracking>(
      `tracking/${encodeURIComponent(waybillNumber)}/`,
      {},
      { idempotent: true, signal }
    )
    return { ...response, data: toArray(response?.data) }
  }

  /* ---------------------------------------------------------------------- */
  /* Transport                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Signs and sends one call, unwraps the envelope and applies the retry
   * policy. Public so new API methods can be used before this client
   * wraps them.
   */
  async call<T>(route: string, payload: unknown, options: CallOptions): Promise<T> {
    if (!route.endsWith("/")) {
      // The server signs with the trailing slash; without it every call fails.
      throw new ApaczkaError(`Route "${route}" must end with a trailing slash`, { route })
    }

    const attempts = options.idempotent ? this.maxRetries + 1 : 1
    let lastError: unknown

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.send<T>(route, payload, options.signal)
      } catch (error) {
        lastError = error
        if (attempt >= attempts || !isRetryable(error) || options.signal?.aborted) {
          throw error
        }
        const delay = backoff(this.retryBaseDelayMs, attempt)
        this.logger?.warn(
          `[apaczka] ${route} failed (${(error as Error).message}); retry ${attempt}/${attempts - 1} in ${delay} ms`
        )
        await sleep(delay)
      }
    }

    throw lastError
  }

  private async send<T>(route: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    const envelope = signRequest({
      appId: this.appId,
      appSecret: this.appSecret,
      route,
      payload,
      now: this.now,
    })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const onAbort = () => controller.abort()
    signal?.addEventListener("abort", onAbort, { once: true })

    const startedAt = this.now()
    let httpResponse: Response
    try {
      httpResponse = await this.fetchImpl(this.baseUrl + route, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": this.userAgent,
        },
        body: new URLSearchParams(envelope).toString(),
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) {
        throw new ApaczkaTimeoutError(route, this.timeoutMs)
      }
      throw new ApaczkaNetworkError(`Apaczka request to ${route} failed: ${(error as Error).message}`, {
        route,
        cause: error,
      })
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
    }

    const text = await httpResponse.text()
    this.logger?.debug?.(`[apaczka] POST ${route} -> HTTP ${httpResponse.status} in ${this.now() - startedAt} ms`)

    let body: ApaczkaEnvelope<T>
    try {
      body = JSON.parse(text)
    } catch (error) {
      throw new ApaczkaResponseError(route, httpResponse.status, text, error)
    }

    if (!body || typeof body !== "object" || typeof body.status !== "number") {
      throw new ApaczkaResponseError(route, httpResponse.status, text)
    }

    if (body.status !== 200) {
      throw new ApaczkaApiError(body.status, body.message, route)
    }

    return body.response as T
  }
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

/** The API returns some lists as objects keyed by index; normalize to arrays. */
export function toArray<T>(value: Record<string, T> | T[] | null | undefined): T[] {
  if (!value) {
    return []
  }
  return Array.isArray(value) ? value : Object.values(value)
}

/** Services from `service_structure`, with `service_id` coerced to a number. */
export function listServices(structure: ApaczkaServiceStructure): ApaczkaService[] {
  return toArray(structure.services).map((service) => ({
    ...service,
    service_id: Number(service.service_id),
  }))
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ApaczkaNetworkError) {
    return true
  }
  if (error instanceof ApaczkaResponseError) {
    return error.httpStatus >= 500 || error.httpStatus === 429
  }
  // Envelope errors are deterministic (validation, auth) — retrying won't help.
  return false
}

function backoff(baseMs: number, attempt: number): number {
  const exponential = baseMs * 2 ** (attempt - 1)
  return Math.round(exponential / 2 + Math.random() * (exponential / 2))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
