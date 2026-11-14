import { model } from "@medusajs/framework/utils"

/** Tier history: every change, with the spend that caused it. */
export const LoyaltyTierChange = model
  .define("loyalty_tier_change", {
    id: model.id({ prefix: "ltch" }).primaryKey(),
    customer_id: model.text(),
    from_tier_id: model.text().nullable(),
    to_tier_id: model.text().nullable(),
    spend: model.bigNumber(),
    trigger: model.text(),
  })
  .indexes([
    { name: "IDX_loyalty_tier_change_customer", on: ["customer_id", "created_at"], where: "deleted_at IS NULL" },
  ])
