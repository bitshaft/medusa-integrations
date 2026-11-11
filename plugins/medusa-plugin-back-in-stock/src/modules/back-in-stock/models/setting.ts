import { model } from "@medusajs/framework/utils"

/** Settings changed in the admin (key → JSON). A missing row means "use the value from the plugin options". */
export const BackInStockSetting = model
  .define("back_in_stock_setting", {
    id: model.id({ prefix: "biset" }).primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ name: "IDX_bis_setting_key_unique", on: ["key"], unique: true, where: "deleted_at IS NULL" }])
