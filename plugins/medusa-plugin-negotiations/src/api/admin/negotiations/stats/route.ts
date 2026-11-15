import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { demoMode } from "../../../../lib/negotiations/api/admin"
import { adminRoute } from "../../../../lib/negotiations/api/utils"
import { resolveNegotiations } from "../../../../lib/negotiations/server/runtime"
import { requireEnabled, sweep } from "../../../../lib/negotiations/server/threads"

/** `GET /admin/negotiations/stats`: the dashboard counters. Amounts are per currency, in minor units. */
export const GET = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireEnabled(req.scope)
  const service = resolveNegotiations(req.scope)
  const is_demo = await demoMode(req)
  await sweep(req.scope)
  const { expiryDays } = await service.getOptions()
  res.json({ stats: await service.stats({ is_demo, now: new Date(), expiryDays }), demo: is_demo })
})
