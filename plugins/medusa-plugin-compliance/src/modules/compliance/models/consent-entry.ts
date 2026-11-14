import { model } from "@medusajs/framework/utils"

import { CONSENT_SOURCES } from "../../../lib/compliance/types"

/**
 * One consent given or withdrawn. Append-only: withdrawing is a new entry.
 * The subject is a customer, an e-mail address or an anonymous browser id.
 */
export const ComplianceConsentEntry = model
  .define("compliance_consent_entry", {
    id: model.id({ prefix: "cce" }).primaryKey(),
    type_key: model.text(),
    version: model.number(),
    granted: model.boolean(),
    customer_id: model.text().nullable(),
    email: model.text().nullable(),
    anonymous_id: model.text().nullable(),
    source: model.enum([...CONSENT_SOURCES]),
    /** Where in the storefront: registration, checkout… */
    placement: model.text().nullable(),
    actor_type: model.text().default("customer"),
    actor_id: model.text().nullable(),
    ip_hash: model.text().nullable(),
  })
  .indexes([
    { name: "IDX_compliance_consent_entry_customer", on: ["customer_id"], where: "deleted_at IS NULL" },
    { name: "IDX_compliance_consent_entry_email", on: ["email"], where: "deleted_at IS NULL" },
    { name: "IDX_compliance_consent_entry_anonymous", on: ["anonymous_id"], where: "deleted_at IS NULL" },
    { name: "IDX_compliance_consent_entry_type", on: ["type_key", "created_at"], where: "deleted_at IS NULL" },
  ])
