import { model } from "@medusajs/framework/utils"

/**
 * Every price this plugin wrote, with the amount it wrote. A price whose
 * amount still matches its newest row was filled; any other price (or one
 * changed since) is manual.
 */
export const CurrencyFilledPrice = model
  .define("currency_filled_price", {
    id: model.id({ prefix: "curfp" }).primaryKey(),
    price_id: model.text(),
    run_id: model.text(),
    variant_id: model.text(),
    product_id: model.text(),
    currency_code: model.text(),
    price_list_id: model.text().nullable(),
    region_id: model.text().nullable(),
    /** `add` or `overwrite`. */
    action: model.text(),
    /** Decimal strings in major units. */
    amount: model.text(),
    previous_amount: model.text().nullable(),
    base_amount: model.text(),
    mode: model.text(),
    rate: model.text(),
    margin: model.text(),
    table_no: model.text().nullable(),
    rate_date: model.text().nullable(),
  })
  .indexes([
    { name: "IDX_currency_filled_price_price_created", on: ["price_id", "created_at"], where: "deleted_at IS NULL" },
    { name: "IDX_currency_filled_price_run", on: ["run_id"], where: "deleted_at IS NULL" },
    { name: "IDX_currency_filled_price_product", on: ["product_id"], where: "deleted_at IS NULL" },
  ])
