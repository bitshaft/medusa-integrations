import { model } from "@medusajs/framework/utils"

export const NegotiationSetting = model
  .define("negotiation_setting", {
    id: model.id({ prefix: "negs" }).primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ name: "IDX_negotiation_setting_key", on: ["key"], unique: true, where: "deleted_at IS NULL" }])
