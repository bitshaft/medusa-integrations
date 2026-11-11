import { HttpClient, HttpStatusError } from "../kit/http"
import type { KitLogger } from "../kit/secrets"
import { type CompanyData, type Outcome, type RegisterResult, splitPolishAddress, unavailable } from "./types"

export const MF_BASE_URLS = {
  production: "https://wl-api.mf.gov.pl",
  test: "https://wl-test.mf.gov.pl",
} as const

export type MfEnvironment = keyof typeof MF_BASE_URLS

export type MfClientOptions = {
  environment?: MfEnvironment
  /** Override the base URL (no trailing slash). */
  baseUrl?: string
  timeoutMs?: number
  /** Extra attempts on network errors and HTTP 5xx. Default 1. */
  maxRetries?: number
  userAgent?: string
  logger?: KitLogger
  fetch?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

type MfSubject = {
  name?: string
  nip?: string | null
  statusVat?: string | null
  regon?: string | null
  krs?: string | null
  residenceAddress?: string | null
  workingAddress?: string | null
  registrationLegalDate?: string | null
  accountNumbers?: string[] | null
}

type MfSearchResponse = { result?: { subject?: MfSubject | null; requestId?: string; requestDateTime?: string } }
type MfCheckResponse = { result?: { accountAssigned?: string; requestId?: string; requestDateTime?: string } }

const STATUSES: Record<string, Outcome> = {
  Czynny: "active",
  Zwolniony: "exempt",
  Niezarejestrowany: "unregistered",
}

export type BankAccountCheck = {
  /** `true`/`false` as the register answered; `null` when it could not be asked. */
  assigned: boolean | null
  request_id: string | null
  checked_at: Date
  error: string | null
}

/**
 * Client for the Ministry of Finance "Wykaz podatników VAT" (the white
 * list). The API needs no key but allows about 100 requests a day per
 * caller; when the limit is reached it answers with an error until midnight.
 *
 * Every method returns a result instead of throwing: a register that is
 * down or over its limit yields `unavailable`, never a verdict about the
 * number. It has no Medusa dependencies.
 */
export class MfClient {
  private readonly http: HttpClient
  private readonly now: () => number

  constructor(options: MfClientOptions = {}) {
    this.now = options.now ?? Date.now
    this.http = new HttpClient({
      baseUrl: (options.baseUrl ?? MF_BASE_URLS[options.environment ?? "production"]).replace(/\/+$/, ""),
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

  /** The white list entry of a NIP as of today: VAT status, company data and bank accounts. */
  async searchNip(nip: string): Promise<RegisterResult> {
    const startedAt = this.now()
    try {
      const response = await this.http.request<MfSearchResponse>({
        path: `/api/search/nip/${encodeURIComponent(nip)}?date=${this.today()}`,
        idempotent: true,
      })
      const subject = response?.result?.subject ?? null
      const base = {
        source: "mf" as const,
        request_id: response?.result?.requestId ?? null,
        checked_at: new Date(this.now()),
        error: null,
        duration_ms: this.now() - startedAt,
      }
      if (!subject) {
        return { ...base, outcome: "not_found", company: null }
      }
      const outcome = STATUSES[subject.statusVat ?? ""]
      if (!outcome) {
        // An entry without a known status (e.g. removed from the register) is not an active VAT payer.
        return { ...base, outcome: "unregistered", company: toCompany(subject) }
      }
      return { ...base, outcome, company: toCompany(subject) }
    } catch (error) {
      return unavailable("mf", describe(error), startedAt, this.now)
    }
  }

  /** Whether a bank account is registered for a NIP on the white list today. */
  async checkBankAccount(nip: string, account: string): Promise<BankAccountCheck> {
    try {
      const response = await this.http.request<MfCheckResponse>({
        path: `/api/check/nip/${encodeURIComponent(nip)}/bank-account/${encodeURIComponent(account)}?date=${this.today()}`,
        idempotent: true,
      })
      return {
        assigned: response?.result?.accountAssigned === "TAK",
        request_id: response?.result?.requestId ?? null,
        checked_at: new Date(this.now()),
        error: null,
      }
    } catch (error) {
      return { assigned: null, request_id: null, checked_at: new Date(this.now()), error: describe(error) }
    }
  }

  /** The register works on Polish calendar days. */
  private today(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date(this.now()))
  }
}

function toCompany(subject: MfSubject): CompanyData {
  const address = subject.workingAddress?.trim() || subject.residenceAddress?.trim() || null
  return {
    name: subject.name?.trim() || null,
    address,
    ...splitPolishAddress(address),
    regon: subject.regon?.trim() || null,
    krs: subject.krs?.trim() || null,
    bank_accounts: (subject.accountNumbers ?? []).filter((account) => typeof account === "string"),
    registered_at: subject.registrationLegalDate ?? null,
  }
}

/** A short reason for the history: the register's own code and message when it sent one. */
function describe(error: unknown): string {
  if (error instanceof HttpStatusError) {
    let details = ""
    try {
      const body = JSON.parse(error.body) as { code?: string; message?: string }
      details = [body.code, body.message].filter(Boolean).join(": ")
    } catch {
      // Not JSON (a gateway page); the status code has to do.
    }
    const limit = error.status === 429 ? " (daily request limit reached; the register opens again at midnight)" : ""
    return `The white list answered HTTP ${error.status}${details ? ` ${details}` : ""}${limit}`
  }
  return `The white list could not be reached: ${error instanceof Error ? error.message : String(error)}`
}
