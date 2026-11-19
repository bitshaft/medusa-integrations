import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { channelNames, variantLabels } from "../../../../lib/back-in-stock/api/enrich"
import { describeSubscription, resolveEnabled } from "../../../../lib/back-in-stock/api/utils"
import type { AdminSubscriptionsQueryParams } from "../../../../lib/back-in-stock/api/validators"
import type { SubscriptionRecord } from "../../../../lib/back-in-stock/types"
import { SUBSCRIPTION_STATUSES } from "../../../../modules/back-in-stock/models/subscription"

/**
 * `GET /admin/back-in-stock/subscriptions` — newest first, with how many
 * notifications each received and when the last one went out. Filter by
 * `status`, `variant_id`, `product_id` (one or several), `sales_channel_id`,
 * `demo`, or search the email with `q`. `counts` has the number per status
 * (and `all`) for the same filters without `status`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const { limit, offset, q, status, product_id, ...rest } =
    req.validatedQuery as unknown as AdminSubscriptionsQueryParams
  const filters: Record<string, unknown> = {
    ...rest,
    ...(product_id ? { product_id: { $in: product_id } } : {}),
    ...(q ? { q } : {}),
  }
  const countOf = async (value?: string) =>
    (
      await service.listAndCountBackInStockSubscriptions(value ? { ...filters, status: value } : filters, {
        take: 1,
        select: ["id"],
      })
    )[1]
  const [[rows, count], totals] = await Promise.all([
    service.listAndCountBackInStockSubscriptions(status ? { ...filters, status } : filters, {
      take: limit,
      skip: offset,
      order: { created_at: "DESC" },
    }),
    Promise.all([countOf(), ...SUBSCRIPTION_STATUSES.map((value) => countOf(value))]),
  ])
  const counts = Object.fromEntries([
    ["all", totals[0]],
    ...SUBSCRIPTION_STATUSES.map((value, index) => [value, totals[index + 1]]),
  ])
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
    counts,
    limit,
    offset,
  })
}
