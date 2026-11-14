import type { MedusaContainer } from "@medusajs/framework/types"

import { describeCoupon } from "../describe"
import { type CodeStats, statsByCode, sumStats } from "../orders"
import { type CouponStatus, couponStatus, isExpiring, type StatusInput } from "../status"
import type { CouponNames, Locale } from "../types"
import { type CouponWithPromotions, loadNames, loadOrdersForPromotions } from "./query"

/** Status inputs of a coupon, whatever promotions carry it. */
export function statusInput(coupon: CouponWithPromotions): StatusInput {
  const promotions = coupon.promotions
  const first = promotions[0]
  const anyActive = promotions.some((p) => p.status === "active")
  let limit: number | null
  let used: number
  if (coupon.batch_size != null) {
    // A batch ends when every single-use code is used.
    limit = promotions.length
    used = promotions.filter((p) => p.limit != null && p.used >= p.limit).length
  } else if (coupon.tiered) {
    // The levels share one usage budget on the campaign; without a limit, add up the levels.
    limit = first?.budget_limit ?? null
    used = limit != null ? (first?.budget_used ?? 0) : promotions.reduce((sum, p) => sum + p.used, 0)
  } else {
    limit = first?.limit ?? null
    used = first?.used ?? 0
  }
  return {
    promotion_status: promotions.length === 0 ? "inactive" : anyActive ? "active" : "inactive",
    starts_at: first?.starts_at ?? coupon.draft.starts_at,
    ends_at: first?.ends_at ?? coupon.draft.ends_at,
    limit,
    used,
    automatic: coupon.automatic,
  }
}

export type CouponView = {
  id: string
  code: string
  name: string | null
  kind: CouponWithPromotions["kind"]
  automatic: boolean
  exclusive: boolean
  tiered: boolean
  batch_size: number | null
  status: CouponStatus
  expiring: boolean
  created_at: string
  starts_at: string | null
  ends_at: string | null
  used: number
  limit: number | null
  per_customer_limit: number | null
  sentence: { pl: string; en: string }
  stats: CodeStats
  promotion_ids: string[]
  codes: string[]
  draft: CouponWithPromotions["draft"]
}

/** Names for every id the given coupons mention. */
export async function namesFor(container: MedusaContainer, coupons: CouponWithPromotions[]): Promise<CouponNames> {
  const ids = { categories: [] as string[], groups: [] as string[], products: [] as string[] }
  for (const { draft } of coupons) {
    ids.categories.push(...draft.category_ids)
    ids.products.push(...draft.buy_product_ids)
    if (draft.audience === "groups") ids.groups.push(...draft.audience_ids)
  }
  return loadNames(container, ids)
}

export function toView(
  coupon: CouponWithPromotions,
  stats: Map<string, CodeStats>,
  names: CouponNames,
  now: Date,
  timeZone: string
): CouponView {
  const input = statusInput(coupon)
  const codes = coupon.promotions.map((p) => p.code)
  const sentenceDraft = {
    ...coupon.draft,
    starts_at: input.starts_at as string | null,
    ends_at: input.ends_at as string | null,
  }
  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    kind: coupon.kind,
    automatic: coupon.automatic,
    exclusive: coupon.exclusive,
    tiered: coupon.tiered,
    batch_size: coupon.batch_size,
    status: couponStatus(input, now),
    expiring: isExpiring(input, now),
    created_at: coupon.created_at,
    starts_at: input.starts_at as string | null,
    ends_at: input.ends_at as string | null,
    used: input.used,
    limit: input.limit,
    per_customer_limit: coupon.draft.per_customer_limit,
    sentence: {
      pl: describeCoupon(sentenceDraft, "pl", { names, timeZone }),
      en: describeCoupon(sentenceDraft, "en", { names, timeZone }),
    },
    stats: sumStats(codes.map((code) => stats.get(code))),
    promotion_ids: coupon.promotions.map((p) => p.id),
    codes,
    draft: coupon.draft,
  }
}

/** Views of the given coupons with all-time order stats. */
export async function buildViews(
  container: MedusaContainer,
  coupons: CouponWithPromotions[],
  now: Date,
  timeZone: string
): Promise<CouponView[]> {
  const promotionIds = coupons.flatMap((c) => c.promotions.map((p) => p.id))
  const [orders, names] = await Promise.all([
    loadOrdersForPromotions(container, promotionIds),
    namesFor(container, coupons),
  ])
  const stats = statsByCode(orders)
  return coupons.map((coupon) => toView(coupon, stats, names, now, timeZone))
}

/** The sentence in one language, for exports. */
export function sentenceOf(view: CouponView, locale: Locale): string {
  return view.sentence[locale]
}
