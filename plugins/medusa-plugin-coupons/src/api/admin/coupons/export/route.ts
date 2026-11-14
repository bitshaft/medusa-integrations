import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled, sendCsv } from "../../../../lib/coupons/api/utils"
import { csvFileName } from "../../../../lib/coupons/csv"
import { couponsCsv } from "../../../../lib/coupons/export"
import { dashboard } from "../../../../lib/coupons/server/admin"

/** `GET /admin/coupons/export?locale=pl` — every coupon with its sentence and stats, as CSV. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const [options, settings] = await Promise.all([service.getOptions(), service.getSettings()])
  const locale = (req.validatedQuery as { locale?: "pl" | "en" }).locale ?? settings.exportLocale
  const now = new Date()
  const { coupons } = await dashboard(req.scope, now)
  sendCsv(res, csvFileName(locale === "pl" ? "kupony" : "coupons", now), couponsCsv(coupons, locale, options.timeZone))
}
