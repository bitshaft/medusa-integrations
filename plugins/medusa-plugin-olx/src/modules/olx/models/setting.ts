import { model } from "@medusajs/framework/utils"

/** Settings changed in the admin and the sync position (key → JSON). */
export const OlxSetting = model
  .define("olx_setting", {
    id: model.id({ prefix: "olxset" }).primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ name: "IDX_olx_setting_key_unique", on: ["key"], unique: true, where: "deleted_at IS NULL" }])
