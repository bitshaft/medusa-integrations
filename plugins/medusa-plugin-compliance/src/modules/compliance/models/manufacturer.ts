import { model } from "@medusajs/framework/utils"

/** A manufacturer profile: written once, attached to many products. */
export const ComplianceManufacturer = model.define("compliance_manufacturer", {
  id: model.id({ prefix: "cmfr" }).primaryKey(),
  /** Name in the admin list. */
  name: model.text().searchable(),
  /** `{ name, trade_name, postal_address, electronic_address }` */
  manufacturer: model.json(),
  outside_eu: model.boolean().default(false),
  /** Responsible person in the EU, same fields; used when `outside_eu`. */
  responsible: model.json(),
})
