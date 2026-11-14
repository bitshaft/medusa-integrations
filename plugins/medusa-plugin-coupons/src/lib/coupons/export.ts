import { toCsv } from "./csv"
import { formatDate } from "./format"
import type { Locale } from "./types"

export type ExportRow = {
  code: string
  name: string | null
  status: string
  automatic: boolean
  kind: string
  sentence: Record<Locale, string>
  used: number
  limit: number | null
  per_customer_limit: number | null
  batch_size: number | null
  starts_at: string | null
  ends_at: string | null
  created_at: string
  stats: { orders: number; revenue: number; discount: number }
}

const HEADERS: Record<Locale, string[]> = {
  pl: [
    "Kod",
    "Nazwa",
    "Status",
    "Jednym zdaniem",
    "Automatyczny",
    "Użycia",
    "Limit łącznie",
    "Limit na klienta",
    "Kodów w paczce",
    "Zamówienia",
    "Obrót",
    "Rabat",
    "Od",
    "Do",
    "Utworzono",
  ],
  en: [
    "Code",
    "Name",
    "Status",
    "In one sentence",
    "Automatic",
    "Uses",
    "Total limit",
    "Limit per customer",
    "Codes in batch",
    "Orders",
    "Revenue",
    "Discount",
    "From",
    "To",
    "Created",
  ],
}

const STATUS: Record<Locale, Record<string, string>> = {
  pl: { active: "aktywny", scheduled: "zaplanowany", paused: "wstrzymany", ended: "zakończony" },
  en: { active: "active", scheduled: "scheduled", paused: "paused", ended: "ended" },
}

/** The coupon list with stats as CSV, in the given language. Automatic coupons show no code. */
export function couponsCsv(rows: ExportRow[], locale: Locale, timeZone: string): string {
  const yes = locale === "pl" ? "tak" : "yes"
  const no = locale === "pl" ? "nie" : "no"
  const date = (value: string | null) => (value ? formatDate(value, locale, timeZone) : "")
  return toCsv(
    HEADERS[locale],
    rows.map((row) => [
      row.automatic ? "" : row.batch_size != null ? "" : row.code,
      row.name,
      STATUS[locale][row.status] ?? row.status,
      row.sentence[locale],
      row.automatic ? yes : no,
      row.used,
      row.limit,
      row.per_customer_limit,
      row.batch_size,
      row.stats.orders,
      row.stats.revenue,
      row.stats.discount,
      date(row.starts_at),
      date(row.ends_at),
      date(row.created_at),
    ])
  )
}

export type BatchExportRow = {
  code: string
  used: boolean
  order_display_id: number | null
  order_id: string | null
  used_at: string | null
}

/** The codes of a batch as CSV: which are used, and in which order. */
export function batchCsv(rows: BatchExportRow[], locale: Locale, timeZone: string): string {
  const headers =
    locale === "pl"
      ? ["Kod", "Użyty", "Zamówienie", "ID zamówienia", "Data użycia"]
      : ["Code", "Used", "Order", "Order ID", "Used on"]
  const yes = locale === "pl" ? "tak" : "yes"
  const no = locale === "pl" ? "nie" : "no"
  return toCsv(
    headers,
    rows.map((row) => [
      row.code,
      row.used ? yes : no,
      row.order_display_id != null ? `#${row.order_display_id}` : "",
      row.order_id,
      row.used_at ? formatDate(row.used_at, locale, timeZone) : "",
    ])
  )
}
