import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { isDemo, requireEnabled } from "../../../../../lib/compliance/api/utils"
import { subjectEntries, subjectState } from "../../../../../lib/compliance/server/consents"

/** `GET /admin/compliance/customers/:id`: consents and requests of one customer, for the customer page widget. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const settings = await service.getSettings()
  if (!settings.modules.gdpr) {
    res.json({ enabled: false, demo: false, consents: [], entries: [], requests: [], anonymized: null })
    return
  }
  if (await isDemo(req)) {
    const now = new Date().toISOString()
    res.json({
      enabled: true,
      demo: true,
      consents: [
        { type_key: "terms", granted: true, version: 2, latest_version: 2, at: now, outdated: false },
        { type_key: "newsletter", granted: true, version: 1, latest_version: 2, at: now, outdated: true },
      ],
      entries: [],
      requests: [{ id: "demo_req_1", type: "access", status: "open", created_at: now }],
      anonymized: null,
    })
    return
  }
  const id = req.params.id
  const [state, entries, requests, anonymized] = await Promise.all([
    subjectState(req.scope, { customer_id: id }),
    subjectEntries(req.scope, { customer_id: id }),
    service.listComplianceRequests(
      { customer_id: id },
      { order: { created_at: "DESC" }, select: ["id", "type", "status", "created_at", "deadline_at"] }
    ),
    service.listComplianceAnonymizations({ customer_id: id }),
  ])
  res.json({
    enabled: true,
    demo: false,
    consents: state,
    entries: entries.reverse().slice(0, 50),
    requests,
    anonymized: anonymized[0] ?? null,
  })
}
