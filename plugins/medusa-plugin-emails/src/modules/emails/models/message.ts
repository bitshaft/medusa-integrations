import { model } from "@medusajs/framework/utils"

export const MESSAGE_STATUSES = ["pending", "sent", "failed", "demo"] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

/**
 * The send log: one row per email and recipient.
 *
 * `dedupe_key` is what makes an email go out once per event: the row is
 * created before sending, and the unique index rejects a second row for the
 * same event. The rendered email is not stored, only the input needed to
 * render it again (never for emails that carry a secret).
 */
export const EmailsMessage = model
  .define("emails_message", {
    id: model.id({ prefix: "emsg" }).primaryKey(),
    type: model.text(),
    locale: model.text(),
    recipient: model.text().searchable(),
    subject: model.text().nullable(),
    status: model.enum([...MESSAGE_STATUSES]).default("pending"),
    dedupe_key: model.text().nullable(),
    order_id: model.text().nullable(),
    customer_id: model.text().nullable(),
    resource_type: model.text().nullable(),
    resource_id: model.text().nullable(),
    /** Event name, `manual`, `test`, `resend` or `workflow`. */
    trigger_type: model.text().nullable(),
    /** Input of the email's loader, kept for retries and resends. */
    input: model.json().nullable(),
    attempts: model.number().default(0),
    /** The retry job may try again (the failure was not ambiguous and the input is stored). */
    retryable: model.boolean().default(false),
    next_retry_at: model.dateTime().nullable(),
    error: model.text().nullable(),
    /** ID of the record in Medusa's notification module. */
    notification_id: model.text().nullable(),
    /** The message this one resends. */
    original_message_id: model.text().nullable(),
    sent_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["dedupe_key"], unique: true, where: "deleted_at IS NULL AND dedupe_key IS NOT NULL" },
    { on: ["order_id"], where: "deleted_at IS NULL AND order_id IS NOT NULL" },
    { on: ["customer_id"], where: "deleted_at IS NULL AND customer_id IS NOT NULL" },
    { on: ["status", "next_retry_at"], where: "deleted_at IS NULL" },
  ])
