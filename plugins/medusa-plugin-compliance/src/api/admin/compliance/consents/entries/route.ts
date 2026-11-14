import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { isDemo, requireModule } from "../../../../../lib/compliance/api/utils"
import type { AdminEntriesQuery } from "../../../../../lib/compliance/api/validators"
import { normalizeEmail } from "../../../../../lib/compliance/requests"

/** `GET /admin/compliance/consents/entries`: the consent register, newest first. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireModule(req, "gdpr")
  const query = req.validatedQuery as unknown as AdminEntriesQuery
  if (await isDemo(req)) {
    const now = Date.now()
    const entries = [
      { type_key: "newsletter", version: 1, granted: false, email: "ola@example.com", source: "admin", minutes: 30 },
      {
        type_key: "cookies.analytics",
        version: 1,
        granted: true,
        anonymous_id: "a1b2c3d4e5",
        source: "storefront",
        minutes: 90,
      },
      { type_key: "terms", version: 2, granted: true, customer_id: "demo_cus_1", source: "storefront", minutes: 300 },
      {
        type_key: "newsletter",
        version: 1,
        granted: true,
        email: "ola@example.com",
        source: "storefront",
        minutes: 4000,
      },
    ].map(({ minutes, ...e }, i) => ({
      id: `demo_cce_${i}`,
      customer_id: null,
      email: null,
      anonymous_id: null,
      placement: null,
      actor_type: e.source === "admin" ? "user" : "customer",
      ...e,
      created_at: new Date(now - minutes * 60_000).toISOString(),
    }))
    res.json({ entries, count: entries.length, limit: query.limit, offset: query.offset })
    return
  }
  const filters: Record<string, unknown> = {}
  if (query.type_key) filters.type_key = query.type_key
  if (query.customer_id) filters.customer_id = query.customer_id
  if (query.email) filters.email = normalizeEmail(query.email)
  const [entries, count] = await service.listAndCountComplianceConsentEntries(filters, {
    order: { created_at: "DESC" },
    take: query.limit,
    skip: query.offset,
  })
  res.json({ entries, count, limit: query.limit, offset: query.offset })
}
