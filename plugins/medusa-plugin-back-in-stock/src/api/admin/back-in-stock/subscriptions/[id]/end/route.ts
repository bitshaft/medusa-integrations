import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { describeSubscription, resolveEnabled } from "../../../../../../lib/back-in-stock/api/utils"
import type { AdminEndSubscriptionBody } from "../../../../../../lib/back-in-stock/api/validators"
import { endBackInStockSubscriptionWorkflow } from "../../../../../../workflows/back-in-stock"

/**
 * `POST /admin/back-in-stock/subscriptions/:id/end` — ends an open
 * subscription, e.g. at the customer's request by phone.
 */
export async function POST(req: MedusaRequest<AdminEndSubscriptionBody>, res: MedusaResponse) {
  await resolveEnabled(req)
  const { result } = await endBackInStockSubscriptionWorkflow(req.scope).run({
    input: { id: req.params.id, status: req.validatedBody.status },
  })
  if (!result.subscription) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Subscription ${req.params.id} was not found`)
  }
  res.json({ outcome: result.outcome, subscription: describeSubscription(result.subscription) })
}
