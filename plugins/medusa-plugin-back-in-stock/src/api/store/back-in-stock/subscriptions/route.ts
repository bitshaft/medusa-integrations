import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import {
  customerId,
  describeForCustomer,
  resolveEnabled,
  storeSalesChannel,
} from "../../../../lib/back-in-stock/api/utils"
import type { StoreSubscribeBody } from "../../../../lib/back-in-stock/api/validators"
import { normalizeLocale } from "../../../../lib/back-in-stock/options"
import type { SubscriptionRecord } from "../../../../lib/back-in-stock/types"
import { createBackInStockSubscriptionWorkflow } from "../../../../workflows/back-in-stock"

/**
 * `POST /store/back-in-stock/subscriptions` — "notify me when available".
 *
 * Returns 400 with code `variant_in_stock` when the variant can be ordered
 * now. Subscribing again returns the existing subscription. With double
 * opt-in the subscription stays `pending` until the emailed link is used.
 */
export async function POST(req: MedusaRequest<StoreSubscribeBody>, res: MedusaResponse) {
  const { options } = await resolveEnabled(req)
  const body = req.validatedBody
  const customer = customerId(req)

  // A logged-in customer always subscribes with their account email; an
  // email in the body is only used for guests.
  let email: string | undefined
  if (customer) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({ entity: "customer", fields: ["email"], filters: { id: customer } })
    email = (data[0] as { email?: string } | undefined)?.email
  }
  email ??= body.email
  if (!email) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter your email address.")
  }

  const { result } = await createBackInStockSubscriptionWorkflow(req.scope).run({
    input: {
      email,
      variant_id: body.variant_id,
      sales_channel_id: storeSalesChannel(req, body.sales_channel_id),
      customer_id: customer,
      locale: normalizeLocale(body.locale ?? req.get("x-medusa-locale"), options.defaultLocale),
      country_code: body.country_code,
    },
  })

  res.status(result.created ? 201 : 200).json({
    subscription: describeForCustomer(result.subscription),
    created: result.created,
    confirmation_required: result.subscription.status === "pending",
  })
}

/** `GET /store/back-in-stock/subscriptions` — the logged-in customer's open subscriptions. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const customer = customerId(req)
  if (!customer) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Log in to see your back-in-stock alerts.")
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "customer", fields: ["email"], filters: { id: customer } })
  const email = (data[0] as { email?: string } | undefined)?.email?.toLowerCase()

  const subscriptions = (await service.listBackInStockSubscriptions(
    {
      status: ["pending", "active"],
      demo: false,
      $or: [{ customer_id: customer }, ...(email ? [{ email }] : [])],
    },
    { take: 200, order: { created_at: "DESC" } }
  )) as unknown as SubscriptionRecord[]
  res.json({ subscriptions: subscriptions.map(describeForCustomer) })
}
