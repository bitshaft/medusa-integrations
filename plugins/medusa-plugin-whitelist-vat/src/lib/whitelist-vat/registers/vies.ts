import { HttpClient, HttpStatusError } from "../kit/http"
import type { KitLogger } from "../kit/secrets"
import { type RegisterResult, unavailable } from "./types"

export const VIES_BASE_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api"

export type ViesClientOptions = {
  baseUrl?: string
  /**
   * The store's own EU VAT number, e.g. `PL5260250274`. With it VIES returns
   * a consultation number, which is the proof tax offices accept.
   */
  requesterVatNumber?: string
  timeoutMs?: number
  /** Extra attempts on network errors and HTTP 5xx. Default 1. */
  maxRetries?: number
  userAgent?: string
  logger?: KitLogger
  fetch?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

type ViesResponse = {
  valid?: boolean
  requestIdentifier?: string
  name?: string
  address?: string
  userError?: string
  actionSucceed?: boolean
  errorWrappers?: Array<{ error?: string; message?: string }>
}

/** Placeholders some member states send instead of data they do not publish. */
const HIDDEN = /^-+$/

/**
 * Client for VIES, the EU's VAT number validation service. It needs no key.
 *
 * VIES relays the question to the member state's own system, and those are
 * often offline for a while. Every such case (and every error VIES reports
 * itself) yields `unavailable`; only an explicit answer becomes `valid` or
 * `invalid`. It has no Medusa dependencies.
 */
export class ViesClient {
  private readonly http: HttpClient
  private readonly now: () => number
  private readonly requester?: { country: string; number: string }

  constructor(options: ViesClientOptions = {}) {
    this.now = options.now ?? Date.now
    const requester = options.requesterVatNumber?.toUpperCase().replace(/[\s.-]/g, "")
    if (requester && /^[A-Z]{2}.+/.test(requester)) {
      this.requester = { country: requester.slice(0, 2), number: requester.slice(2) }
    }
    this.http = new HttpClient({
      baseUrl: (options.baseUrl ?? VIES_BASE_URL).replace(/\/+$/, ""),
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries ?? 1,
      userAgent: options.userAgent,
      logPrefix: "[whitelist-vat]",
      logger: options.logger,
      fetch: options.fetch,
      now: options.now,
      sleep: options.sleep,
    })
  }

  /** Asks VIES about `countryCode` + `vatNumber` (the number without its prefix). */
  async check(countryCode: string, vatNumber: string): Promise<RegisterResult> {
    const startedAt = this.now()
    try {
      const response = await this.http.request<ViesResponse>({
        path: "/check-vat-number",
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          countryCode,
          vatNumber,
          ...(this.requester
            ? { requesterMemberStateCode: this.requester.country, requesterNumber: this.requester.number }
            : {}),
        }),
        // A lookup: asking twice changes nothing.
        idempotent: true,
      })

      const problem = reportedError(response)
      if (problem) {
        return unavailable("vies", `VIES could not answer: ${problem}`, startedAt, this.now)
      }
      if (typeof response?.valid !== "boolean") {
        return unavailable("vies", "VIES sent an answer without a verdict", startedAt, this.now)
      }

      const name = clean(response.name)
      const address = clean(response.address)
      return {
        source: "vies",
        outcome: response.valid ? "valid" : "invalid",
        request_id: response.requestIdentifier?.trim() || null,
        checked_at: new Date(this.now()),
        company: response.valid && (name || address) ? { name, address } : null,
        error: null,
        duration_ms: this.now() - startedAt,
      }
    } catch (error) {
      const reason =
        error instanceof HttpStatusError
          ? `VIES answered HTTP ${error.status}${reportedError(safeJson(error.body)) ? ` (${reportedError(safeJson(error.body))})` : ""}`
          : `VIES could not be reached: ${error instanceof Error ? error.message : String(error)}`
      return unavailable("vies", reason, startedAt, this.now)
    }
  }
}

/**
 * VIES reports problems inside HTTP 200 responses: `userError` other than
 * `VALID`/`INVALID` (e.g. `MS_UNAVAILABLE`, `MS_MAX_CONCURRENT_REQ`,
 * `SERVICE_UNAVAILABLE`, `TIMEOUT`), or `actionSucceed: false` with error codes.
 */
function reportedError(response: ViesResponse | null | undefined): string | null {
  if (!response) {
    return null
  }
  if (response.actionSucceed === false || response.errorWrappers?.length) {
    return (
      response.errorWrappers
        ?.map((wrapper) => wrapper.error ?? wrapper.message)
        .filter(Boolean)
        .join(", ") || "unknown error"
    )
  }
  if (response.userError && !["VALID", "INVALID"].includes(response.userError)) {
    return response.userError
  }
  return null
}

function clean(value: string | undefined): string | null {
  const text = value
    ?.replace(/\s*\n\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
  return text && !HIDDEN.test(text) ? text : null
}

function safeJson(text: string): ViesResponse | null {
  try {
    return JSON.parse(text) as ViesResponse
  } catch {
    return null
  }
}
