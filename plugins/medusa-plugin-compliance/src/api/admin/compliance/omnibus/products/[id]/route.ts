import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { isDemo, requireModule } from "../../../../../../lib/compliance/api/utils"
import { demoOmnibus } from "../../../../../../lib/compliance/demo"
import { addDays } from "../../../../../../lib/compliance/format"
import { productPriceHistory } from "../../../../../../lib/compliance/server/views"

/** `GET /admin/compliance/omnibus/products/:id`: price history of every variant and region, for the product widget. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireModule(req, "omnibus")
  const settings = await service.getSettings()
  if (await isDemo(req)) {
    res.json({
      demo: true,
      period_days: settings.omnibus.period_days,
      started_at: addDays(new Date(), -120).toISOString(),
      series: demoOmnibus(new Date(), settings.omnibus.period_days).slice(0, 1),
    })
    return
  }
  res.json({
    demo: false,
    period_days: settings.omnibus.period_days,
    ...(await productPriceHistory(req.scope, req.params.id)),
  })
}
