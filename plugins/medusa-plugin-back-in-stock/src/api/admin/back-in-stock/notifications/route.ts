import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { channelNames, variantLabels } from "../../../../lib/back-in-stock/api/enrich"
import { describeNotification, resolveEnabled } from "../../../../lib/back-in-stock/api/utils"
import type { AdminNotificationsQueryParams } from "../../../../lib/back-in-stock/api/validators"
import type { NotificationRecord } from "../../../../lib/back-in-stock/types"

/**
 * `GET /admin/back-in-stock/notifications` — the sent history, newest first,
 * with the recipient. Filter by `status`, `subscription_id` or `variant_id`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const { limit, offset, ...filters } = req.validatedQuery as unknown as AdminNotificationsQueryParams
  const [rows, count] = await service.listAndCountBackInStockNotifications(filters, {
    take: limit,
    skip: offset,
    order: { created_at: "DESC" },
  })
  const notifications = rows as unknown as NotificationRecord[]
  const subscriptionIds = [...new Set(notifications.map((row) => row.subscription_id))]
  const subscriptions = subscriptionIds.length
    ? ((await service.listBackInStockSubscriptions(
        { id: subscriptionIds },
        { take: null, select: ["id", "email", "demo"] }
      )) as Array<{ id: string; email: string | null; demo: boolean }>)
    : []
  const recipients = new Map(subscriptions.map((row) => [row.id, row]))
  const [labels, channels] = await Promise.all([
    variantLabels(
      req.scope,
      notifications.map((row) => row.variant_id)
    ),
    channelNames(
      req.scope,
      notifications.map((row) => row.sales_channel_id)
    ),
  ])
  res.json({
    notifications: notifications.map((notification) => ({
      ...describeNotification(notification),
      email: recipients.get(notification.subscription_id)?.email ?? null,
      demo: recipients.get(notification.subscription_id)?.demo ?? false,
      product: labels[notification.variant_id],
      sales_channel_name: channels[notification.sales_channel_id] ?? notification.sales_channel_id,
    })),
    count,
    limit,
    offset,
  })
}
