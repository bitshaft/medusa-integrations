import { ApaczkaApiError, ApaczkaError, ApaczkaNetworkError, ApaczkaResponseError, ApaczkaTimeoutError } from "./errors"
import type { KitLogger } from "../kit/secrets"
import { HttpClient, HttpNetworkError, HttpTimeoutError } from "../kit/http"
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
export type ApaczkaLogger = KitLogger

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
 * Handles HMAC request signing and the "HTTP 200 for everything" envelope.
 * Timeouts, safe retries and secret masking come from the shared kit HTTP client. It has no Medusa dependencies and can be used
 * on its own.
 */
export class ApaczkaClient {
  readonly baseUrl: string
  readonly environment: ApaczkaEnvironment | "custom"
  /** True for `DemoApaczkaClient`, which answers itself instead of calling Apaczka. */
  readonly demo: boolean = false

  private readonly appId: string
  private readonly appSecret: string
  private readonly now: () => number
  private readonly http: HttpClient

  constructor(options: ApaczkaClientOptions) {
    if (!options.appId || !options.appSecret) {
      throw new ApaczkaError("Apaczka appId and appSecret are required")
    }

    this.appId = options.appId
    this.appSecret = options.appSecret
    this.environment = options.baseUrl ? "custom" : (options.environment ?? "production")
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? APACZKA_BASE_URLS[options.environment ?? "production"])
    this.now = options.now ?? Date.now
    this.http = new HttpClient({
      baseUrl: this.baseUrl,
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRetries: options.maxRetries ?? 2,
      retryBaseDelayMs: options.retryBaseDelayMs ?? 300,
      userAgent: options.userAgent ?? "apaczka-node-client",
      logPrefix: "[apaczka]",
      logger: options.logger,
      // The secret is never sent, only used to sign; masked anyway in case an echo or a bug leaks it.
      secrets: [options.appSecret],
      retryOn: (error) =>
        error instanceof ApaczkaResponseError && (error.httpStatus >= 500 || error.httpStatus === 429),
      fetch: options.fetch,
      now: this.now,
    })
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

    // Signed once: `expires` leaves minutes of headroom, enough for every retry.
    const envelope = signRequest({
      appId: this.appId,
      appSecret: this.appSecret,
      route,
      payload,
      now: this.now,
    })

    try {
      return await this.http.request<T>({
        path: route,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams(envelope).toString(),
        idempotent: options.idempotent,
        signal: options.signal,
        parse: (response) => parseEnvelope<T>(route, response.status, response.text),
      })
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        throw new ApaczkaTimeoutError(route, error.timeoutMs)
      }
      if (error instanceof HttpNetworkError) {
        throw new ApaczkaNetworkError(`Apaczka request to ${route} failed: ${error.message}`, { route, cause: error })
      }
      throw error
    }
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

/** Unwraps Apaczka's envelope: the API answers HTTP 200 and puts the outcome in `status`. */
function parseEnvelope<T>(route: string, httpStatus: number, text: string): T {
  let body: ApaczkaEnvelope<T>
  try {
    body = JSON.parse(text)
  } catch (error) {
    throw new ApaczkaResponseError(route, httpStatus, text, error)
  }

  if (!body || typeof body !== "object" || typeof body.status !== "number") {
    throw new ApaczkaResponseError(route, httpStatus, text)
  }

  if (body.status !== 200) {
    throw new ApaczkaApiError(body.status, body.message, route)
  }

  return body.response as T
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`
}
