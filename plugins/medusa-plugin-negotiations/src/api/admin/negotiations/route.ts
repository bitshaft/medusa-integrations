import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { demoMode, listRow } from "../../../lib/negotiations/api/admin"
import { actorId, adminRoute, parse } from "../../../lib/negotiations/api/utils"
import { AdminListQuery } from "../../../lib/negotiations/api/validators"
import { resolveNegotiations } from "../../../lib/negotiations/server/runtime"
import { requireEnabled, sweep } from "../../../lib/negotiations/server/threads"

/**
 * `GET /admin/negotiations`: threads with filters and search, counts per
 * status, the oldest one waiting for the team. `assignee` is `me`, `none`
 * (nobody leads it) or a user id.
 */
export const GET = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireEnabled(req.scope)
  const query = parse(AdminListQuery, req.query)
  const service = resolveNegotiations(req.scope)
  const is_demo = await demoMode(req)
  await sweep(req.scope)
  // "me" without a signed-in user (an API key) matches nothing.
  const assignee_id =
    query.assignee === undefined
      ? undefined
      : query.assignee === "none"
        ? null
        : query.assignee === "me"
          ? (actorId(req) ?? "")
          : query.assignee
  const base = { is_demo, q: query.q, customer_id: query.customer_id, product_id: query.product_id, assignee_id }
  const [{ threads, count }, counts, oldest] = await Promise.all([
    service.listThreads({
      ...base,
      status: query.status,
      waiting: query.waiting,
      limit: query.limit,
      offset: query.offset,
    }),
    service.statusCounts(base),
    service.oldestWaiting(is_demo),
  ])
  res.json({
    negotiations: await Promise.all(threads.map((t) => listRow(req, t))),
    count,
    counts,
    oldest_waiting_id: oldest,
    demo: is_demo,
    limit: query.limit,
    offset: query.offset,
  })
})
