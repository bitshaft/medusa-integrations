import { model } from "@medusajs/framework/utils"

export const TOKEN_PURPOSES = ["confirm", "unsubscribe"] as const
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number]

/**
 * A link token, stored as its SHA-256 hash only. Every email gets a fresh
 * unsubscribe token and all of them stay valid while the subscription is
 * open, so a link in an old email still works.
 */
export const BackInStockToken = model
  .define("back_in_stock_token", {
    id: model.id({ prefix: "bitok" }).primaryKey(),
    subscription_id: model.text(),
    purpose: model.enum([...TOKEN_PURPOSES]),
    token_hash: model.text(),
    used_at: model.dateTime().nullable(),
  })
  .indexes([
    { name: "IDX_bis_token_hash_unique", on: ["token_hash"], unique: true, where: "deleted_at IS NULL" },
    { name: "IDX_bis_token_subscription_id", on: ["subscription_id"], where: "deleted_at IS NULL" },
  ])
