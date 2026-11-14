import { model } from "@medusajs/framework/utils"

/** The program settings the owner edits in the admin (one row, key "settings"). */
export const LoyaltySetting = model
  .define("loyalty_setting", {
    id: model.id({ prefix: "lset" }).primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ name: "IDX_loyalty_setting_key_unique", on: ["key"], unique: true, where: "deleted_at IS NULL" }])
