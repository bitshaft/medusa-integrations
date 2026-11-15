import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { source } from "../../../../../lib/stripe/api/utils"
import type { AdminRefreshQuery } from "../../../../../lib/stripe/api/validators"
import { demoOrderPayments } from "../../../../../lib/stripe/demo"
import { orderPayments } from "../../../../../lib/stripe/server/views"

/** `GET /admin/stripe/orders/:id`: the Stripe side of an order's payments, for the order widget. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { refresh } = req.validatedQuery as unknown as AdminRefreshQuery
  const from = source(req)
  res.json(
    from.demo
      ? { demo: true, ...demoOrderPayments(req.params.id) }
      : { demo: false, ...(await orderPayments(req.scope, from.reader, req.params.id, { fresh: refresh })) }
  )
}
