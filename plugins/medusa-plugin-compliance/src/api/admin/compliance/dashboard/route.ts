import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { isDemo, requireEnabled } from "../../../../lib/compliance/api/utils"
import { demoGpsrProducts, demoOmnibus, demoRequests } from "../../../../lib/compliance/demo"
import { addDays } from "../../../../lib/compliance/format"
import { daysLeft } from "../../../../lib/compliance/requests"
import { dashboard } from "../../../../lib/compliance/server/views"

/** `GET /admin/compliance/dashboard`: state and open problems of each module. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  if (!(await isDemo(req))) {
    res.json({ demo: false, ...(await dashboard(req.scope)) })
    return
  }
  const settings = await service.getSettings()
  const now = new Date()
  const products = demoGpsrProducts(now)
  const open = demoRequests(now, settings.gdpr.response_days)
    .filter((r) => r.status === "open" || r.status === "accepted")
    .map((r) => ({ ...r, days: daysLeft(new Date(r.deadline_at!), now) }))
    .sort((a, b) => a.days - b.days)
  const omnibus = demoOmnibus(now, settings.omnibus.period_days)
  res.json({
    demo: true,
    modules: { gpsr: true, gdpr: true, omnibus: true },
    gpsr: { products: products.length, incomplete: products.filter((p) => !p.complete).length, checked_at: now },
    gdpr: {
      open: open.length,
      unverified: 1,
      due_soon: open.filter((r) => r.days >= 0 && r.days <= settings.gdpr.warn_days).length,
      overdue: open.filter((r) => r.days < 0).length,
      next_deadline: open[0]
        ? { id: open[0].id, type: open[0].type, deadline_at: open[0].deadline_at, days_left: open[0].days }
        : null,
    },
    omnibus: {
      started_at: addDays(now, -120).toISOString(),
      discounted_products: omnibus.length,
      incomplete: omnibus.filter((o) => o.history_incomplete).length,
    },
  })
}
