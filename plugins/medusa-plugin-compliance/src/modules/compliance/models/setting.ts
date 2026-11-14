import { model } from "@medusajs/framework/utils"

/** Settings ("settings") and internal values such as the date recording started. */
export const ComplianceSetting = model
  .define("compliance_setting", {
    id: model.id({ prefix: "cset" }).primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ name: "IDX_compliance_setting_key", on: ["key"], unique: true, where: "deleted_at IS NULL" }])
