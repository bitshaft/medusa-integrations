import PromotionModule from "@medusajs/medusa/promotion"
import { defineLink } from "@medusajs/framework/utils"

import LoyaltyModule from "../modules/loyalty"

/** Read-only link from a reward code's promotion to its redemption: `fields: ["loyalty_redemption.*"]`. */
export default defineLink(
  { linkable: PromotionModule.linkable.promotion, field: "id" },
  { ...LoyaltyModule.linkable.loyaltyRedemption.id, primaryKey: "promotion_id" },
  { readOnly: true }
)
