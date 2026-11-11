import { HttpClient } from "../kit/http"
import type { KitLogger } from "../kit/secrets"
import { type CompanyData, type RegisterResult, unavailable } from "./types"

export const GUS_URLS = {
  production: "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc",
  test: "https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc",
} as const

export type GusEnvironment = keyof typeof GUS_URLS

/** Public key of the test environment (old, anonymised data), published by GUS. */
export const GUS_TEST_KEY = "abcde12345abcde12345" // check-repo: allow-secret (public test key from the GUS documentation)

export type GusClientOptions = {
  /** User key issued by GUS (api.stat.gov.pl → REGON API). */
  apiKey: string
  environment?: GusEnvironment
  /** Override the service URL. */
  url?: string
  timeoutMs?: number
  userAgent?: string
  logger?: KitLogger
  fetch?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const NS = "http://CIS/BIR/PUBL/2014/07"
/** GUS ends sessions after 60 minutes; log in again a little earlier. */
const SESSION_MS = 50 * 60_000
/** `ErrorCode` GUS returns when nothing matches the search. */
const NOT_FOUND_CODE = "4"

/**
 * Client for BIR1.1, the REGON register's SOAP service at Statistics Poland
 * (GUS). Unlike the white list it knows every business, not only VAT
 * payers, and it has no daily limit, but each store needs its own key.
 *
 * The service works with sessions: `Zaloguj` returns a session ID that is
 * sent as the `sid` header. An empty search result means the session is
 * gone, so the client logs in again and repeats the search once.
 *
 * Returns results instead of throwing and has no Medusa dependencies.
 */
export class GusClient {
  private readonly http: HttpClient
  private readonly url: string
  private readonly apiKey: string
  private readonly now: () => number
  private session: { sid: string; expires: number } | null = null
  private loggingIn: Promise<string> | null = null

  constructor(options: GusClientOptions) {
    this.apiKey = options.apiKey
    this.url = options.url ?? GUS_URLS[options.environment ?? "production"]
    this.now = options.now ?? Date.now
    this.http = new HttpClient({
      baseUrl: this.url,
      timeoutMs: options.timeoutMs,
      maxRetries: 1,
      userAgent: options.userAgent,
      logPrefix: "[whitelist-vat]",
      logger: options.logger,
      secrets: [options.apiKey],
      fetch: options.fetch,
      now: options.now,
      sleep: options.sleep,
    })
  }

  /** The REGON entry of a NIP: name, address, REGON and whether the business is still active. */
  async searchNip(nip: string): Promise<RegisterResult> {
    const startedAt = this.now()
    try {
      let records = await this.search(nip)
      if (records === null) {
        // No result element content: the session expired on the server.
        this.session = null
        records = await this.search(nip)
      }
      if (records === null) {
        return unavailable(
          "gus",
          "GUS returned an empty answer twice (the session could not be renewed)",
          startedAt,
          this.now
        )
      }

      const base = {
        source: "gus" as const,
        // BIR has no request IDs; the time of the answer is the record.
        request_id: null,
        checked_at: new Date(this.now()),
        error: null,
        duration_ms: this.now() - startedAt,
      }
      const errorCode = records[0]?.ErrorCode
      if (errorCode === NOT_FOUND_CODE || !records.length) {
        return { ...base, outcome: "not_found", company: null }
      }
      if (errorCode) {
        const message = records[0].ErrorMessageEn || records[0].ErrorMessagePl || `error code ${errorCode}`
        return unavailable("gus", `GUS could not answer: ${message}`, startedAt, this.now)
      }

      // One NIP can have several entries (a company and its closed predecessor); prefer an active one.
      const active = records.find((record) => !record.DataZakonczeniaDzialalnosci) ?? null
      const record = active ?? records[0]
      return { ...base, outcome: active ? "found" : "inactive", company: toCompany(record) }
    } catch (error) {
      return unavailable(
        "gus",
        `GUS could not be reached: ${error instanceof Error ? error.message : String(error)}`,
        startedAt,
        this.now
      )
    }
  }

  /** Records of the search, or `null` when the service sent no result at all. */
  private async search(nip: string): Promise<Array<Record<string, string>> | null> {
    const sid = await this.login()
    const response = await this.call(
      "DaneSzukajPodmioty",
      `<ns:DaneSzukajPodmioty><ns:pParametryWyszukiwania><dat:Nip>${escapeXml(nip)}</dat:Nip></ns:pParametryWyszukiwania></ns:DaneSzukajPodmioty>`,
      sid
    )
    const result = extractResult(response, "DaneSzukajPodmiotyResult")
    return result ? parseRecords(decodeXml(result)) : null
  }

  private async login(): Promise<string> {
    if (this.session && this.session.expires > this.now()) {
      return this.session.sid
    }
    // Parallel verifications share one login.
    this.loggingIn ??= (async () => {
      try {
        const response = await this.call(
          "Zaloguj",
          `<ns:Zaloguj><ns:pKluczUzytkownika>${escapeXml(this.apiKey)}</ns:pKluczUzytkownika></ns:Zaloguj>`
        )
        const sid = extractResult(response, "ZalogujResult")?.trim()
        if (!sid) {
          throw new Error("GUS did not accept the API key (check gus.apiKey and gus.environment)")
        }
        this.session = { sid, expires: this.now() + SESSION_MS }
        return sid
      } finally {
        this.loggingIn = null
      }
    })()
    return this.loggingIn
  }

  private call(action: string, body: string, sid?: string): Promise<string> {
    const envelope =
      `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="${NS}" xmlns:dat="${NS}/DataContract">` +
      `<soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">` +
      `<wsa:To>${this.url}</wsa:To>` +
      `<wsa:Action>${NS}/IUslugaBIRzewnPubl/${action}</wsa:Action>` +
      `</soap:Header><soap:Body>${body}</soap:Body></soap:Envelope>`
    return this.http.request<string>({
      path: "",
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8", ...(sid ? { sid } : {}) },
      body: envelope,
      // Logging in and searching can be repeated safely.
      idempotent: true,
      parse: (response) => {
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`GUS answered HTTP ${response.status}`)
        }
        return response.text
      },
    })
  }
}

/* XML helpers: the answers are small and flat, so no parser dependency is needed. */

/** Content of `<…:Name>…</…:Name>` in a SOAP (MTOM) response; `null` when missing or empty. */
export function extractResult(soap: string, name: string): string | null {
  const match = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(soap)
  return match && match[1].trim() ? match[1] : null
}

export function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Every `<dane>` element of `<root>` as a flat object of its child elements. */
export function parseRecords(xml: string): Array<Record<string, string>> {
  return [...xml.matchAll(/<dane>([\s\S]*?)<\/dane>/g)].map((match) => {
    const record: Record<string, string> = {}
    for (const field of match[1].matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) {
      record[field[1]] = decodeXml(field[2]).trim()
    }
    return record
  })
}

function toCompany(record: Record<string, string>): CompanyData {
  const building = [record.NrNieruchomosci, record.NrLokalu].filter(Boolean).join("/")
  // Villages have no street names: the address is the village and the building number.
  const street = [record.Ulica || (building ? record.Miejscowosc : ""), building].filter(Boolean).join(" ") || null
  const city = record.MiejscowoscPoczty || record.Miejscowosc || null
  const locality = [record.KodPocztowy, city].filter(Boolean).join(" ")
  return {
    name: record.Nazwa || null,
    address: [street, locality].filter(Boolean).join(", ") || null,
    street,
    postal_code: record.KodPocztowy || null,
    city,
    regon: record.Regon || null,
    // P: legal entity or organisational unit; F: natural person running a business.
    legal_form: record.Typ?.startsWith("P")
      ? "legal_entity"
      : record.Typ?.startsWith("F")
        ? "sole_proprietorship"
        : null,
  }
}
