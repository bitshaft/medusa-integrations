import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { source } from "../../../../lib/stripe/api/utils"
import type { AdminPayoutsQuery } from "../../../../lib/stripe/api/validators"
import { demoPayouts } from "../../../../lib/stripe/demo"
import { payouts } from "../../../../lib/stripe/server/views"

/** `GET /admin/stripe/payouts?days=90`: payouts with date, amount and status. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { days, refresh } = req.validatedQuery as unknown as AdminPayoutsQuery
  const from = source(req)
  res.json(
    from.demo
      ? { demo: true, ...demoPayouts() }
      : { demo: false, ...(await payouts(req.scope, from.reader, { days, fresh: refresh })) }
  )
}
