import { model } from "@medusajs/framework/utils"

/** An order of an anonymised customer whose billing address is removed when the retention period ends. */
export const ComplianceOrderRetention = model
  .define("compliance_order_retention", {
    id: model.id({ prefix: "cord" }).primaryKey(),
    order_id: model.text(),
    customer_id: model.text(),
    purge_after: model.dateTime(),
    purged_at: model.dateTime().nullable(),
  })
  .indexes([
    { name: "IDX_compliance_order_retention_order", on: ["order_id"], unique: true, where: "deleted_at IS NULL" },
    {
      name: "IDX_compliance_order_retention_due",
      on: ["purge_after"],
      where: "deleted_at IS NULL AND purged_at IS NULL",
    },
  ])
