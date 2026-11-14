import { model } from "@medusajs/framework/utils"

import { COUPON_KINDS } from "../../../lib/coupons/types"

/**
 * One coupon as the owner sees it. Discounts are computed by the Promotion
 * Module: this row keeps the wizard settings and is linked to the promotion
 * or promotions that carry them (one for a plain coupon, one per level for a
 * tiered coupon, one per code for a batch).
 */
export const CouponsCoupon = model
  .define("coupons_coupon", {
    id: model.id({ prefix: "coup" }).primaryKey(),
    /** The code customers type, or the internal group code of an automatic coupon or batch. */
    code: model.text(),
    /** Optional label for the admin list. */
    name: model.text().nullable(),
    kind: model.enum([...COUPON_KINDS]),
    automatic: model.boolean().default(false),
    exclusive: model.boolean().default(false),
    tiered: model.boolean().default(false),
    /** For batches: how many single-use codes were generated, and their prefix. */
    batch_size: model.number().nullable(),
    batch_prefix: model.text().nullable(),
    /** The wizard settings (`CouponDraft`). */
    draft: model.json(),
    /** The campaign that carries the dates (and the shared usage limit of tiered coupons). */
    campaign_id: model.text().nullable(),
  })
  .indexes([{ name: "IDX_coupons_coupon_code_unique", on: ["code"], unique: true, where: "deleted_at IS NULL" }])
