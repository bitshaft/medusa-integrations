import { model } from "@medusajs/framework/utils"

/**
 * A customer anonymised after an erasure request. Signed-in sessions and
 * tokens of these customers are refused.
 */
export const ComplianceAnonymization = model
  .define("compliance_anonymization", {
    id: model.id({ prefix: "can" }).primaryKey(),
    customer_id: model.text(),
    request_id: model.text().nullable(),
    actor_id: model.text().nullable(),
    summary: model.json().nullable(),
  })
  .indexes([
    { name: "IDX_compliance_anonymization_customer", on: ["customer_id"], unique: true, where: "deleted_at IS NULL" },
  ])
