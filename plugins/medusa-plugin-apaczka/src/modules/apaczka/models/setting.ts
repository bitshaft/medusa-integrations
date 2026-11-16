import { model } from "@medusajs/framework/utils"

/** Settings staff change in the admin (Settings tab), one row per key. Plugin options stay in medusa-config. */
export const ApaczkaSetting = model
  .define("apaczka_setting", {
    id: model.id({ prefix: "apzset" }).primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ name: "IDX_apaczka_setting_key", on: ["key"], unique: true, where: "deleted_at IS NULL" }])
