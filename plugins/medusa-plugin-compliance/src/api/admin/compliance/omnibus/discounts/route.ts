import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { isDemo, requireModule } from "../../../../../lib/compliance/api/utils"
import { demoOmnibus } from "../../../../../lib/compliance/demo"
import { discountRows } from "../../../../../lib/compliance/server/views"

/** `GET /admin/compliance/omnibus/discounts`: variants on discount with the lowest prior price; `incomplete` flags short history. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireModule(req, "omnibus")
  const settings = await service.getSettings()
  const rows = (await isDemo(req))
    ? demoOmnibus(new Date(), settings.omnibus.period_days).filter((r) => r.discounted)
    : await discountRows(req.scope)
  res.json({
    started_at: (await service.omnibusStartedAt())?.toISOString() ?? null,
    period_days: settings.omnibus.period_days,
    discounts: rows.map(({ points: _points, ...r }: Record<string, any>) => r),
  })
}
