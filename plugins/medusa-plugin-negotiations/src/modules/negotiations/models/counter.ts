import { model } from "@medusajs/framework/utils"

/** The last thread number per year (NEG-2026-0001), raised by one atomic upsert. */
export const NegotiationCounter = model
  .define("negotiation_counter", {
    id: model.id({ prefix: "negc" }).primaryKey(),
    year: model.number(),
    value: model.number().default(0),
  })
  .indexes([{ name: "IDX_negotiation_counter_year", on: ["year"], unique: true }])
