import { model } from "@medusajs/framework/utils"

import { DISCOUNT_KINDS, PRICE_SOURCES } from "../../../lib/compliance/types"

/**
 * A variant's price in one region and currency, with tax, from `recorded_at`
 * until the next record. Append-only: only changes are recorded.
 */
export const CompliancePriceRecord = model
  .define("compliance_price_record", {
    id: model.id({ prefix: "cpr" }).primaryKey(),
    variant_id: model.text(),
    product_id: model.text(),
    region_id: model.text(),
    currency_code: model.text(),
    amount: model.bigNumber(),
    regular_amount: model.bigNumber(),
    discounted: model.boolean(),
    discount_kind: model.enum([...DISCOUNT_KINDS]).nullable(),
    /** Price list or promotion id. */
    discount_ref: model.text().nullable(),
    source: model.enum([...PRICE_SOURCES]),
    /** First record of this series; `start_known` says whether sales started then. */
    series_start: model.boolean().default(false),
    start_known: model.boolean().default(false),
    recorded_at: model.dateTime(),
  })
  .indexes([
    {
      name: "IDX_compliance_price_record_series",
      on: ["variant_id", "region_id", "currency_code", "recorded_at"],
      where: "deleted_at IS NULL",
    },
    { name: "IDX_compliance_price_record_product", on: ["product_id"], where: "deleted_at IS NULL" },
  ])
