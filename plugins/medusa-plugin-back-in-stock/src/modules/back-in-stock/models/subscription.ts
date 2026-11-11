import { model } from "@medusajs/framework/utils"

/**
 * - `pending`: waiting for the customer to confirm (double opt-in)
 * - `active`: notified on every restock until it ends
 * - `purchased`, `unsubscribed`, `expired`: ended
 */
export const SUBSCRIPTION_STATUSES = ["pending", "active", "purchased", "unsubscribed", "expired"] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const OPEN_STATUSES: SubscriptionStatus[] = ["pending", "active"]
export const ENDED_STATUSES: SubscriptionStatus[] = ["purchased", "unsubscribed", "expired"]

/**
 * A request to be told when a variant is in stock again in a sales channel.
 *
 * The email is used for this notification only. After the retention period
 * an ended subscription keeps no personal data (`email` and `customer_id`
 * are cleared, tokens deleted), so the statistics stay correct.
 */
export const BackInStockSubscription = model
  .define("back_in_stock_subscription", {
    id: model.id({ prefix: "bisub" }).primaryKey(),
    /** Lower-cased. `null` once anonymised. */
    email: model.text().searchable().nullable(),
    variant_id: model.text(),
    product_id: model.text().nullable(),
    sales_channel_id: model.text(),
    customer_id: model.text().nullable(),
    locale: model.text(),
    /** For the product link in emails (`{country_code}` in `urls.product`). */
    country_code: model.text().nullable(),
    status: model.enum([...SUBSCRIPTION_STATUSES]).default("pending"),
    /** The consent text shown when the customer subscribed. */
    consent_text: model.text().nullable(),
    confirmed_at: model.dateTime().nullable(),
    notification_count: model.number().default(0),
    last_notified_at: model.dateTime().nullable(),
    ended_at: model.dateTime().nullable(),
    /** Emails and personal data were removed by the retention job. */
    anonymized_at: model.dateTime().nullable(),
    /** Created by demo mode: never sent, deleted with the demo data. */
    demo: model.boolean().default(false),
  })
  .indexes([
    {
      name: "IDX_bis_subscription_open_unique",
      on: ["email", "variant_id", "sales_channel_id"],
      unique: true,
      where: "deleted_at IS NULL AND status IN ('pending', 'active')",
    },
    {
      name: "IDX_bis_subscription_variant_channel_status",
      on: ["variant_id", "sales_channel_id", "status"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_bis_subscription_customer_id",
      on: ["customer_id"],
      where: "deleted_at IS NULL AND customer_id IS NOT NULL",
    },
    { name: "IDX_bis_subscription_status_created_at", on: ["status", "created_at"], where: "deleted_at IS NULL" },
  ])
