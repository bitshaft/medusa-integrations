import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../../../lib/loyalty/api/utils"
import { ledgerCsv } from "../../../../../../lib/loyalty/export"
import type { EntryType } from "../../../../../../lib/loyalty/types"

type Query = {
  type?: EntryType
  from?: string
  to?: string
  offset: number
  limit: number
  format: "json" | "csv"
  locale?: "pl" | "en"
}

/**
 * `GET /admin/loyalty/customers/:id/entries?type=order&from=2026-01-01&to=2026-12-31`
 * — the customer's ledger, newest first, with the balance after each entry.
 * `format=csv` downloads it (dates inclusive, in the store time zone's days).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const { type, from, to, offset, limit, format, locale } = req.validatedQuery as unknown as Query
  const all = await service.listLoyaltyEntries(
    { customer_id: req.params.id },
    { order: { created_at: "ASC", id: "ASC" } }
  )
  let running = 0
  const withBalance = all.map((entry) => ({
    ...entry,
    points: Number(entry.points),
    balance_after: (running += Number(entry.points)),
  }))
  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity
  const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity
  const filtered = withBalance
    .filter(
      (e) =>
        (!type || e.type === type) &&
        new Date(e.created_at).getTime() >= fromTime &&
        new Date(e.created_at).getTime() <= toTime
    )
    .reverse()

  if (format === "csv") {
    const options = await service.getOptions()
    const lang = locale ?? options.defaultLocale
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${lang === "pl" ? "punkty" : "points"}-${req.params.id}.csv"`
    )
    res.status(200).send(ledgerCsv(filtered, lang, options.timeZone))
    return
  }
  res.json({ entries: filtered.slice(offset, offset + limit), count: filtered.length, offset, limit, balance: running })
}
