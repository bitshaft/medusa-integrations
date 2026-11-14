import { model } from "@medusajs/framework/utils"

import { REDEMPTION_STATUSES, REWARD_KINDS } from "../../../lib/loyalty/types"

/** One redemption: the code it created or the gift it put in a cart, and what became of it. */
export const LoyaltyRedemption = model
  .define("loyalty_redemption", {
    id: model.id({ prefix: "lred" }).primaryKey(),
    reward_id: model.text(),
    reward_name: model.text(),
    customer_id: model.text(),
    kind: model.enum([...REWARD_KINDS]),
    cost: model.number(),
    status: model.enum([...REDEMPTION_STATUSES]),
    code: model.text().nullable(),
    promotion_id: model.text().nullable(),
    expires_at: model.dateTime().nullable(),
    cart_id: model.text().nullable(),
    variant_id: model.text().nullable(),
    order_id: model.text().nullable(),
  })
  .indexes([
    { name: "IDX_loyalty_redemption_customer_reward", on: ["customer_id", "reward_id"], where: "deleted_at IS NULL" },
    { name: "IDX_loyalty_redemption_status", on: ["status"], where: "deleted_at IS NULL" },
    { name: "IDX_loyalty_redemption_cart", on: ["cart_id"], where: "deleted_at IS NULL" },
    { name: "IDX_loyalty_redemption_code", on: ["code"], where: "deleted_at IS NULL" },
  ])
