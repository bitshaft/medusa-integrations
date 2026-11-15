import { model } from "@medusajs/framework/utils"

/**
 * The minimum price of a variant in one currency, in minor units. Kept in
 * its own table, not in the variant's metadata, because metadata is
 * returned by the Store API.
 */
export const NegotiationVariantFloor = model
  .define("negotiation_variant_floor", {
    id: model.id({ prefix: "negf" }).primaryKey(),
    variant_id: model.text(),
    currency_code: model.text(),
    amount: model.number(),
  })
  .indexes([
    {
      name: "IDX_negotiation_variant_floor_unique",
      on: ["variant_id", "currency_code"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])
