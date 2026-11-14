import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled, sendCsv } from "../../../../../lib/coupons/api/utils"
import { csvFileName } from "../../../../../lib/coupons/csv"
import { batchCsv } from "../../../../../lib/coupons/export"
import { batchCodes } from "../../../../../lib/coupons/server/admin"

/**
 * `GET /admin/coupons/:id/codes` — the codes of a batch, used or not and in
 * which order. Add `?format=csv` (and `&locale=en`) for a CSV download.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const codes = await batchCodes(req.scope, req.params.id)
  if (req.query.format !== "csv") {
    res.json({ codes })
    return
  }
  const [options, settings] = await Promise.all([service.getOptions(), service.getSettings()])
  const locale = (req.validatedQuery as { locale?: "pl" | "en" }).locale ?? settings.exportLocale
  sendCsv(res, csvFileName(locale === "pl" ? "kody" : "codes", new Date()), batchCsv(codes, locale, options.timeZone))
}
