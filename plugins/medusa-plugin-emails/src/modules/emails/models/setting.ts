import { model } from "@medusajs/framework/utils"

/**
 * Settings changed in the admin, as key → JSON: `general`, `type:<type>`
 * and `copy:<group>`. A missing row means "use the default".
 */
export const EmailsSetting = model
  .define("emails_setting", {
    id: model.id({ prefix: "eset" }).primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ on: ["key"], unique: true, where: "deleted_at IS NULL" }])
