import PromotionModule from "@medusajs/medusa/promotion"
import { defineLink } from "@medusajs/framework/utils"

import CouponsModule from "../modules/coupons"

/**
 * A coupon and the promotions that carry it: one for a plain coupon, one
 * per level for a tiered coupon, one per code for a batch.
 *
 * ```ts
 * query.graph({ entity: "coupons_coupon", fields: ["id", "promotions.code", "promotions.used"] })
 * query.graph({ entity: "promotion", fields: ["code", "coupons_coupon.id"] })
 * ```
 */
export default defineLink(CouponsModule.linkable.couponsCoupon, {
  linkable: PromotionModule.linkable.promotion,
  isList: true,
})
