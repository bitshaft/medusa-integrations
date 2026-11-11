import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { channelNames, variantLabels } from "../../../../lib/back-in-stock/api/enrich"
import { describeSubscription, resolveEnabled } from "../../../../lib/back-in-stock/api/utils"
import type { AdminSubscriptionsQueryParams } from "../../../../lib/back-in-stock/api/validators"
import type { SubscriptionRecord } from "../../../../lib/back-in-stock/types"

/**
 * `GET /admin/back-in-stock/subscriptions` — newest first, with how many
 * notifications each received and when the last one went out. Filter by
 * `status`, `variant_id`, `product_id`, `sales_channel_id`, `demo`, or search
 * the email with `q`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const { limit, offset, q, ...filters } = req.validatedQuery as unknown as AdminSubscriptionsQueryParams
  const [rows, count] = await service.listAndCountBackInStockSubscriptions(
    { ...filters, ...(q ? { q } : {}) },
    { take: limit, skip: offset, order: { created_at: "DESC" } }
  )
  const subscriptions = rows as unknown as SubscriptionRecord[]
  const [labels, channels] = await Promise.all([
    variantLabels(
      req.scope,
      subscriptions.map((row) => row.variant_id)
    ),
    channelNames(
      req.scope,
      subscriptions.map((row) => row.sales_channel_id)
    ),
  ])
  res.json({
    subscriptions: subscriptions.map((subscription) => ({
      ...describeSubscription(subscription),
      product: labels[subscription.variant_id],
      sales_channel_name: channels[subscription.sales_channel_id] ?? subscription.sales_channel_id,
    })),
    count,
    limit,
    offset,
  })
}
