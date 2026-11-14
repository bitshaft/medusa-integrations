import { model } from "@medusajs/framework/utils"

/**
 * GPSR data of one product, plus the result of the completeness check.
 * Every product gets a row on the first check, so products without data
 * are listed too.
 */
export const ComplianceProductSafety = model
  .define("compliance_product_safety", {
    id: model.id({ prefix: "cps" }).primaryKey(),
    product_id: model.text(),
    manufacturer_id: model.text().nullable(),
    /** Overrides of the profile, field by field. */
    manufacturer: model.json().nullable(),
    /** null: use the profile's flag. */
    outside_eu: model.boolean().nullable(),
    responsible: model.json().nullable(),
    /** `{ type, model, batch, batch_applicable }` */
    identification: model.json().nullable(),
    label_image_url: model.text().nullable(),
    /** Markdown per language: `{ pl, en }`. */
    warnings: model.json().nullable(),
    /** Missing fields from the last check. */
    gaps: model.json().nullable(),
    complete: model.boolean().default(false),
    checked_at: model.dateTime().nullable(),
    /** Copied from the product at the last check, for lists. */
    product_title: model.text().nullable(),
    product_status: model.text().nullable(),
  })
  .indexes([
    { name: "IDX_compliance_product_safety_product", on: ["product_id"], unique: true, where: "deleted_at IS NULL" },
    { name: "IDX_compliance_product_safety_complete", on: ["complete"], where: "deleted_at IS NULL" },
  ])
