import { model } from "@medusajs/framework/utils"

import { REWARD_KINDS } from "../../../lib/loyalty/types"

/** A reward in the catalog. Rewards someone redeemed can be switched off, not deleted. */
export const LoyaltyReward = model.define("loyalty_reward", {
  id: model.id({ prefix: "lrew" }).primaryKey(),
  name: model.text(),
  description: model.text().nullable(),
  kind: model.enum([...REWARD_KINDS]),
  /** Amount for `fixed`, percent for `percentage`; unused otherwise. */
  value: model.bigNumber().nullable(),
  currency_code: model.text().nullable(),
  /** The product variant given for `gift`. */
  variant_id: model.text().nullable(),
  cost: model.number(),
  active: model.boolean().default(true),
  min_tier_id: model.text().nullable(),
  per_customer_limit: model.number().nullable(),
  /** Days a reward code stays valid. */
  code_valid_days: model.number().nullable(),
})
