import { HttpClient, HttpStatusError, type HttpClientOptions } from "../kit/http"
import { type RateProvider, RateSourceError, type RateTable } from "./types"

/**
 * The National Bank of Poland's table A (average rates), from
 * `api.nbp.pl`. No key, no account. Rates are PLN per one unit of each
 * currency. A table is published on working days around 11:45-12:15 Warsaw
 * time; a day without one (weekend, holiday) answers 404 "Brak danych".
 */

type NbpTable = {
  table: string
  no: string
  effectiveDate: string
  rates: Array<{ currency: string; code: string; mid: number }>
}

/** Published by then on a working day (Warsaw time). */
const PUBLISHED_AT = { hour: 12, minute: 30 }
/** Range asked for when looking up a day, so a long holiday still finds a table. */
const LOOKBACK_DAYS = 14

export class NbpRateProvider implements RateProvider {
  readonly id = "nbp"
  readonly label = "NBP"
  private readonly http: HttpClient

  constructor(options: Pick<HttpClientOptions, "baseUrl" | "timeoutMs" | "logger" | "userAgent" | "fetch" | "sleep">) {
    this.http = new HttpClient({
      ...options,
      // Looked up at call time, so tests and proxies that replace fetch take effect.
      fetch: options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args)),
      logPrefix: "[currency] NBP",
      maxRetries: 1,
    })
  }

  async latest(): Promise<RateTable> {
    const tables = await this.get("/exchangerates/tables/A/")
    return toRateTable(tables[tables.length - 1])
  }

  async on(date: string): Promise<RateTable> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new RateSourceError(`Expected a date like 2026-11-19, got "${date}"`, "invalid")
    }
    const tables = await this.get(`/exchangerates/tables/A/${addDays(date, -LOOKBACK_DAYS)}/${date}/`)
    return toRateTable(tables[tables.length - 1])
  }

  nextExpected(table: RateTable): Date {
    return nextPublication(table.date)
  }

  private async get(path: string): Promise<NbpTable[]> {
    try {
      const body = await this.http.request<unknown>({
        path: `${path}?format=json`,
        headers: { Accept: "application/json" },
        idempotent: true,
      })
      if (!Array.isArray(body) || !body.length) {
        throw new RateSourceError("NBP answered without a table", "invalid")
      }
      return body as NbpTable[]
    } catch (error) {
      if (error instanceof RateSourceError) throw error
      if (error instanceof HttpStatusError && error.status === 404) {
        throw new RateSourceError("NBP has no table for that day", "no_data")
      }
      throw new RateSourceError(`NBP did not answer: ${(error as Error).message}`)
    }
  }
}

/** Checks and converts one NBP table. Numbers are read from their JSON text form, never computed. */
export function toRateTable(table: NbpTable | undefined): RateTable {
  if (!table || typeof table.no !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(String(table.effectiveDate))) {
    throw new RateSourceError("NBP answered with a table in an unexpected format", "invalid")
  }
  const rates: Record<string, string> = {}
  for (const rate of table.rates ?? []) {
    if (typeof rate?.code !== "string" || typeof rate.mid !== "number" || !(rate.mid > 0)) continue
    rates[rate.code.toUpperCase()] = decimalText(rate.mid)
  }
  if (!Object.keys(rates).length) {
    throw new RateSourceError("NBP answered with an empty table", "invalid")
  }
  return { provider: "nbp", table: table.no, date: table.effectiveDate, base: "PLN", rates }
}

/** A JSON number as its shortest decimal text (0.011969 stays "0.011969", never 1.1969e-2). */
function decimalText(value: number): string {
  const text = String(value)
  if (!/e/i.test(text)) return text
  return value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "")
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** The first working day (Mon-Fri) after `date`, at the publication time in Warsaw. */
export function nextPublication(date: string): Date {
  let day = addDays(date, 1)
  for (;;) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
    if (weekday !== 0 && weekday !== 6) break
    day = addDays(day, 1)
  }
  return warsawTime(day, PUBLISHED_AT.hour, PUBLISHED_AT.minute)
}

/** A wall-clock time in Warsaw as an instant (CET or CEST, whichever applies that day). */
export function warsawTime(day: string, hour: number, minute: number): Date {
  const [y, m, d] = day.split("-").map(Number)
  const guess = Date.UTC(y, m - 1, d, hour, minute)
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess))
  const shown =
    Number(parts.find((p) => p.type === "hour")?.value) * 60 + Number(parts.find((p) => p.type === "minute")?.value)
  const offsetMinutes = shown - (hour * 60 + minute)
  return new Date(guess - offsetMinutes * 60_000)
}
