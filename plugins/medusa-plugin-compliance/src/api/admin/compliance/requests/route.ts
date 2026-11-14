import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { isDemo, requireModule } from "../../../../lib/compliance/api/utils"
import type { AdminRequestsQuery } from "../../../../lib/compliance/api/validators"
import { demoRequests } from "../../../../lib/compliance/demo"
import { daysLeft } from "../../../../lib/compliance/requests"

type Row = Record<string, any>

const withDays = (rows: Row[], now: Date) =>
  rows.map((r) => ({
    ...r,
    days_left:
      r.deadline_at && (r.status === "open" || r.status === "accepted") ? daysLeft(new Date(r.deadline_at), now) : null,
  }))

/** `GET /admin/compliance/requests?status=open,accepted&type=`: requests, nearest deadline first. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireModule(req, "gdpr")
  const query = req.validatedQuery as unknown as AdminRequestsQuery
  const now = new Date()
  const statuses = query.status?.split(",")
  if (await isDemo(req)) {
    const rows = demoRequests(now, (await service.getSettings()).gdpr.response_days).filter(
      (r) => (!statuses || statuses.includes(r.status)) && (!query.type || r.type === query.type)
    )
    res.json({ requests: withDays(rows, now), count: rows.length, limit: query.limit, offset: query.offset })
    return
  }
  const filters: Record<string, unknown> = {}
  if (statuses) filters.status = statuses
  if (query.type) filters.type = query.type
  const [rows, count] = await service.listAndCountComplianceRequests(filters, {
    order: { deadline_at: "ASC", created_at: "DESC" },
    take: query.limit,
    skip: query.offset,
    select: [
      "id",
      "type",
      "status",
      "email",
      "customer_id",
      "locale",
      "details",
      "created_at",
      "verified_at",
      "deadline_at",
      "closed_at",
      "reminded_at",
    ],
  })
  res.json({ requests: withDays(rows as Row[], now), count, limit: query.limit, offset: query.offset })
}
