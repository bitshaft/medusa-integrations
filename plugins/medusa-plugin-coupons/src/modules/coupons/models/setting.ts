import { model } from "@medusajs/framework/utils"

/** Settings changed in the admin (key → JSON). A missing row means "use the value from the plugin options". */
export const CouponsSetting = model
  .define("coupons_setting", {
    id: model.id({ prefix: "coupset" }).primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ name: "IDX_coupons_setting_key_unique", on: ["key"], unique: true, where: "deleted_at IS NULL" }])
