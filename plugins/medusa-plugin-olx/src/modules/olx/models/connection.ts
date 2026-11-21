import { model } from "@medusajs/framework/utils"

/** The connected OLX seller account (one per store). Tokens are encrypted. */
export const OlxConnection = model
  .define("olx_connection", {
    id: model.id({ prefix: "olxcon" }).primaryKey(),
    key: model.text().default("default"),
    olx_user_id: model.text().nullable(),
    olx_user_name: model.text().nullable(),
    is_business: model.boolean().default(false),
    access_token: model.text(),
    refresh_token: model.text(),
    access_expires_at: model.dateTime(),
    needs_reconnect: model.boolean().default(false),
    last_error: model.text().nullable(),
  })
  .indexes([{ name: "IDX_olx_connection_key_unique", on: ["key"], unique: true, where: "deleted_at IS NULL" }])
