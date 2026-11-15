import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminRoute, parse } from "../../../../lib/negotiations/api/utils"
import { AdminRunsQuery } from "../../../../lib/negotiations/api/validators"
import { resolveNegotiations } from "../../../../lib/negotiations/server/runtime"
import { requireEnabled } from "../../../../lib/negotiations/server/threads"

/** `GET /admin/negotiations/runs`: history of the writers (plan, dry run, write, error), newest first. */
export const GET = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireEnabled(req.scope)
  const query = parse(AdminRunsQuery, req.query)
  res.json({ runs: await resolveNegotiations(req.scope).listRuns(query) })
})
