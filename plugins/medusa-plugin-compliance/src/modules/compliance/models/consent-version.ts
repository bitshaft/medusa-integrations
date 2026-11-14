import { model } from "@medusajs/framework/utils"

/** One wording of a consent. Append-only: a changed text is a new version. */
export const ComplianceConsentVersion = model
  .define("compliance_consent_version", {
    id: model.id({ prefix: "ccv" }).primaryKey(),
    type_key: model.text(),
    version: model.number(),
    /** `{ pl, en }` */
    text: model.json(),
    text_hash: model.text(),
    actor_id: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_compliance_consent_version_unique",
      on: ["type_key", "version"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])
