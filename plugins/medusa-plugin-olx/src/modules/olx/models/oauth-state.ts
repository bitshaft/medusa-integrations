import { model } from "@medusajs/framework/utils"

/** A started "Connect OLX": only the hash of the state, spent once, valid for minutes. */
export const OlxOauthState = model
  .define("olx_oauth_state", {
    id: model.id({ prefix: "olxst" }).primaryKey(),
    state_hash: model.text(),
    expires_at: model.dateTime(),
  })
  .indexes([{ name: "IDX_olx_oauth_state_hash_unique", on: ["state_hash"], unique: true, where: "deleted_at IS NULL" }])
