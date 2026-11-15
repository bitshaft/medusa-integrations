import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { source } from "../../../../lib/stripe/api/utils"
import type { AdminOverviewQuery } from "../../../../lib/stripe/api/validators"
import { demoOverview } from "../../../../lib/stripe/demo"
import { overview } from "../../../../lib/stripe/server/views"

/** `GET /admin/stripe/overview?days=7|30&refresh=true`: turnover, fees, net, success rate, balance, payouts, by method. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { days, refresh } = req.validatedQuery as unknown as AdminOverviewQuery
  const from = source(req)
  res.json(
    from.demo
      ? { demo: true, ...demoOverview(days) }
      : { demo: false, ...(await overview(req.scope, from.reader, { days, fresh: refresh })) }
  )
}
