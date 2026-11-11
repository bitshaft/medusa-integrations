import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { customerId, describeForCustomer, resolveEnabled } from "../../../../../../lib/back-in-stock/api/utils"
import type { SubscriptionRecord } from "../../../../../../lib/back-in-stock/types"
import { endBackInStockSubscriptionWorkflow } from "../../../../../../workflows/back-in-stock"

/**
 * `POST /store/back-in-stock/subscriptions/:id/unsubscribe` — a logged-in
 * customer ends one of their own subscriptions (matched by account or email).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const customer = customerId(req)
  if (!customer) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Log in to manage your back-in-stock alerts.")
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "customer", fields: ["email"], filters: { id: customer } })
  const email = (data[0] as { email?: string } | undefined)?.email?.toLowerCase()

  const [subscription] = (await service.listBackInStockSubscriptions(
    { id: req.params.id, $or: [{ customer_id: customer }, ...(email ? [{ email }] : [])] },
    { take: 1 }
  )) as unknown as SubscriptionRecord[]
  if (!subscription) {
    // Someone else's subscription answers the same as a missing one.
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Back-in-stock alert not found.")
  }

  const { result } = await endBackInStockSubscriptionWorkflow(req.scope).run({
    input: { id: subscription.id, status: "unsubscribed" },
  })
  res.json({ subscription: describeForCustomer(result.subscription ?? subscription) })
}
