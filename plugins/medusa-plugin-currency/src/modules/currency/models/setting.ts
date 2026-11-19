import { model } from "@medusajs/framework/utils"

/** Settings changed in the admin (key → JSON). A missing row means "the defaults". */
export const CurrencySetting = model
  .define("currency_setting", {
    id: model.id({ prefix: "curset" }).primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ name: "IDX_currency_setting_key_unique", on: ["key"], unique: true, where: "deleted_at IS NULL" }])
