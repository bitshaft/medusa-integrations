import { model } from "@medusajs/framework/utils"

import { CONSENT_PLACEMENTS, COOKIE_CATEGORIES } from "../../../lib/compliance/types"

/** A kind of consent (newsletter, terms, analytics cookies…). Its texts are versions. */
export const ComplianceConsentType = model
  .define("compliance_consent_type", {
    id: model.id({ prefix: "cctp" }).primaryKey(),
    key: model.text(),
    /** `{ pl, en }` */
    name: model.json(),
    placement: model.enum([...CONSENT_PLACEMENTS]),
    required: model.boolean().default(false),
    active: model.boolean().default(true),
    cookie_category: model.enum([...COOKIE_CATEGORIES]).nullable(),
  })
  .indexes([{ name: "IDX_compliance_consent_type_key", on: ["key"], unique: true, where: "deleted_at IS NULL" }])
