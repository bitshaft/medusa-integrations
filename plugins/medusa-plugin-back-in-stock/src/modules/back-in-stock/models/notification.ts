import { model } from "@medusajs/framework/utils"

/**
 * - `pending`: claimed, being sent. Left behind only by a crash mid-send;
 *   the cleanup job then counts it as sent (an email may have gone out).
 * - `sent`, `demo`: delivered, or rendered and logged in demo mode
 * - `skipped`: the emails plugin chose not to send (e.g. the type is switched off)
 * - `failed`: the provider refused; the next restock tries again
 */
export const NOTIFICATION_STATUSES = ["pending", "sent", "demo", "skipped", "failed"] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export const NOTIFICATION_KINDS = ["restock", "confirm"] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/** The sent history: one row per email to one subscription. */
export const BackInStockNotification = model
  .define("back_in_stock_notification", {
    id: model.id({ prefix: "binot" }).primaryKey(),
    subscription_id: model.text(),
    variant_id: model.text(),
    sales_channel_id: model.text(),
    kind: model.enum([...NOTIFICATION_KINDS]).default("restock"),
    status: model.enum([...NOTIFICATION_STATUSES]).default("pending"),
    /** `emails` (through @bitshaft/medusa-plugin-emails), `notification` (built-in template) or `demo`. */
    via: model.text().nullable(),
    /** Units available when the email was sent. */
    available: model.number().nullable(),
    error: model.text().nullable(),
    sent_at: model.dateTime().nullable(),
  })
  .indexes([
    // One email in flight per subscription: a retry or a second worker cannot send twice.
    {
      name: "IDX_bis_notification_pending_unique",
      on: ["subscription_id"],
      unique: true,
      where: "deleted_at IS NULL AND status = 'pending'",
    },
    {
      name: "IDX_bis_notification_subscription_created",
      on: ["subscription_id", "created_at"],
      where: "deleted_at IS NULL",
    },
    { name: "IDX_bis_notification_variant_created", on: ["variant_id", "created_at"], where: "deleted_at IS NULL" },
  ])
