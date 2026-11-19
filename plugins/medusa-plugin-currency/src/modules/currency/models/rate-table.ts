import { model } from "@medusajs/framework/utils"

/**
 * Saved exchange rate tables, one per source and day. The newest is the
 * cache, older ones stay so every fill can be traced back to its table.
 */
export const CurrencyRateTable = model
  .define("currency_rate_table", {
    id: model.id({ prefix: "currate" }).primaryKey(),
    /** The source's id, e.g. "nbp". */
    provider: model.text(),
    /** The table's number as published, e.g. "225/A/NBP/2026". */
    table_no: model.text(),
    /** The day the table applies to, `YYYY-MM-DD`. */
    effective_date: model.text(),
    /** The currency the rates are quoted in ("PLN"). */
    base: model.text(),
    /** Uppercase code → base units per one unit, as decimal strings. */
    rates: model.json(),
    /** When the source last confirmed this table as its newest. */
    checked_at: model.dateTime(),
  })
  .indexes([
    {
      name: "IDX_currency_rate_table_provider_date_unique",
      on: ["provider", "effective_date"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])
