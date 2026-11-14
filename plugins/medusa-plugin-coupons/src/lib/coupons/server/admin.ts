import type { IPromotionModuleService, MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"

import {
  BATCH_CREATED_EVENT,
  createCouponsCouponWorkflow,
  deleteCouponsCouponWorkflow,
  setCouponsCouponStatusWorkflow,
  updateCouponsCouponWorkflow,
} from "../../../workflows/coupons"
import { randomCode } from "../codes"
import { describeCoupon } from "../describe"
import { normalizeCode } from "../format"
import { type CodeStats, statsByCode, sumStats } from "../orders"
import { buildCampaign, buildPromotions, type PromotionSpec, tierCode } from "../promotions"
import { couponStatus } from "../status"
import { sortedTiers } from "../tiers"
import type { CouponDraft, Locale } from "../types"
import { type DraftReport, validateDraft } from "../validation"
import { type CouponWithPromotions, loadCoupons, loadNames, loadOrdersForPromotions, resolveCoupons } from "./query"
import { buildViews, type CouponView, statusInput } from "./records"

export { BATCH_CREATED_EVENT }

/** Cleans up what the wizard sends: upper-case code, sorted tiers, no code on automatic coupons. */
export function normalizeDraft(draft: CouponDraft, currencyCode: string): CouponDraft {
  const tiered = !!draft.tiers?.length && (draft.kind === "percentage" || draft.kind === "fixed")
  return {
    ...draft,
    code: draft.automatic ? null : draft.code ? normalizeCode(draft.code) : null,
    currency_code: (draft.currency_code || currencyCode).toLowerCase(),
    value: tiered || draft.kind === "free_shipping" ? null : draft.value,
    tiers: tiered ? sortedTiers(draft.tiers!) : null,
    category_ids: draft.kind === "category" ? draft.category_ids : [],
    buy_product_ids: draft.kind === "buy_get" ? draft.buy_product_ids : [],
    buy_qty: draft.kind === "buy_get" ? draft.buy_qty : null,
    get_qty: draft.kind === "buy_get" ? draft.get_qty : null,
    audience_ids: draft.audience === "all" ? [] : [...new Set(draft.audience_ids)],
  }
}

/** Which part of an order a coupon discounts, for the overlap warning. */
const partOf = (draft: CouponDraft) => (draft.kind === "free_shipping" ? "shipping" : "items")

/** Codes a new coupon would take in the Promotion Module. */
function codesFor(draft: CouponDraft): string[] {
  if (!draft.code) return []
  return draft.tiers?.length ? [draft.code, ...draft.tiers.map((_, i) => tierCode(draft.code!, i))] : [draft.code]
}

/** Errors and warnings for the wizard, checked against the store's other coupons. */
export async function reviewDraft(
  container: MedusaContainer,
  draft: CouponDraft,
  ignoreCouponId?: string
): Promise<DraftReport> {
  const others = (await loadCoupons(container)).filter((c) => c.id !== ignoreCouponId)
  const codes = codesFor(draft)
  let codeTaken = false
  if (codes.length) {
    if (others.some((c) => codes.includes(c.code))) codeTaken = true
    else {
      const existing = await container
        .resolve<IPromotionModuleService>(Modules.PROMOTION)
        .listPromotions({ code: codes }, { select: ["id"] })
      const own = new Set(
        ignoreCouponId ? (await loadCoupons(container, { id: ignoreCouponId }))[0]?.promotions.map((p) => p.id) : []
      )
      codeTaken = existing.some((p) => !own.has(p.id))
    }
  }
  const now = new Date()
  const overlapsActive = others.some((other) => {
    const status = couponStatus(statusInput(other), now)
    if (status !== "active" && status !== "scheduled") return false
    if (partOf(other.draft) !== partOf(draft)) return false
    // Two codes only stack if a customer types both; an automatic coupon stacks by itself.
    return (other.automatic && !other.exclusive) || draft.automatic
  })
  return validateDraft(draft, { codeTaken, overlapsActive })
}

function invalid(report: DraftReport): MedusaError {
  return new MedusaError(MedusaError.Types.INVALID_DATA, `The coupon is not valid: ${report.errors.join(", ")}`)
}

const rowFor = (draft: CouponDraft, code: string, name: string | null, batch?: { prefix: string; size: number }) => ({
  code,
  name,
  kind: draft.kind,
  automatic: draft.automatic,
  exclusive: draft.exclusive,
  tiered: !!draft.tiers?.length,
  batch_size: batch?.size ?? null,
  batch_prefix: batch?.prefix ?? null,
  draft,
})

/** Creates a coupon after checking it; automatic coupons get an internal code. */
export async function createCoupon(
  container: MedusaContainer,
  input: { draft: CouponDraft; name?: string | null; paused?: boolean }
): Promise<{ id: string }> {
  const service = resolveCoupons(container)
  const settings = await service.getSettings()
  const draft = normalizeDraft(input.draft, settings.currencyCode)
  const report = await reviewDraft(container, draft)
  if (report.errors.length) throw invalid(report)

  const group = draft.automatic ? `AUTO-${randomCode(8)}` : draft.code!
  const { result } = await createCouponsCouponWorkflow(container).run({
    input: {
      row: rowFor(draft, group, input.name ?? null),
      campaign: buildCampaign(draft, group),
      specs: buildPromotions(draft, group),
    },
  })
  if (input.paused) await setStatus(container, result.id, "paused")
  return result
}

/**
 * A batch of single-use codes: one promotion per code (limit 1), all on one
 * coupon and campaign. Emits `bitshaft.coupons.batch_created` with the
 * batch id, so other plugins (a newsletter, say) can hand the codes out.
 */
export async function createBatch(
  container: MedusaContainer,
  input: { draft: CouponDraft; prefix: string; quantity: number; name?: string | null }
): Promise<{ id: string; quantity: number }> {
  const service = resolveCoupons(container)
  const [options, settings] = await Promise.all([service.getOptions(), service.getSettings()])
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > options.maxBatchSize) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `A batch needs between 1 and ${options.maxBatchSize} codes (the maxBatchSize option).`
    )
  }
  const prefix = normalizeCode(input.prefix ?? "").replace(/[^A-Z0-9-]/g, "")
  if (prefix.length > 12) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The batch prefix can have at most 12 letters, digits or dashes."
    )
  }
  // Each code gets its own promotion below; validate the shared settings with a stand-in code.
  const draft = normalizeDraft(
    { ...input.draft, automatic: false, code: "BATCHCODE", tiers: null, usage_limit: 1, per_customer_limit: null },
    settings.currencyCode
  )
  const report = validateDraft(draft)
  if (report.errors.length) throw invalid(report)

  const codes = await uniqueCodes(container, input.quantity, prefix, settings.codeLength)
  const group = `BATCH-${randomCode(8)}`
  const specs: PromotionSpec[] = codes.map((code) => {
    const [spec] = buildPromotions({ ...draft, code }, code)
    return { ...spec, metadata: { ...spec.metadata, coupons_group: group } }
  })
  const { result } = await createCouponsCouponWorkflow(container).run({
    input: {
      row: rowFor({ ...draft, code: null }, group, input.name ?? null, { prefix, size: codes.length }),
      campaign: buildCampaign(draft, group),
      specs,
    },
  })
  return { id: result.id, quantity: codes.length }
}

/** Random codes no promotion uses yet. */
async function uniqueCodes(
  container: MedusaContainer,
  quantity: number,
  prefix: string,
  length: number
): Promise<string[]> {
  const promotionModule = container.resolve<IPromotionModuleService>(Modules.PROMOTION)
  const codes = new Set<string>()
  for (let attempt = 0; codes.size < quantity && attempt < 10; attempt++) {
    const fresh = new Set<string>()
    while (fresh.size < quantity - codes.size) {
      const code = randomCode(length, prefix)
      if (!codes.has(code)) fresh.add(code)
    }
    const candidates = [...fresh]
    const taken = new Set<string>()
    for (let i = 0; i < candidates.length; i += 500) {
      const existing = await promotionModule.listPromotions(
        { code: candidates.slice(i, i + 500) },
        { select: ["code"] }
      )
      for (const p of existing) taken.add(p.code!)
    }
    for (const code of candidates) if (!taken.has(code)) codes.add(code)
  }
  if (codes.size < quantity) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Could not find enough free codes. Use a longer code length or another prefix."
    )
  }
  return [...codes]
}

async function requireCoupon(container: MedusaContainer, id: string): Promise<CouponWithPromotions> {
  const [coupon] = await loadCoupons(container, { id })
  if (!coupon) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Coupon ${id} was not found.`)
  return coupon
}

/**
 * Edits a coupon in place. The code, the kind, automatic or not, and the
 * number of tiers define which promotions exist, so they cannot change:
 * duplicate the coupon instead.
 */
export async function updateCoupon(
  container: MedusaContainer,
  id: string,
  input: { draft: CouponDraft; name?: string | null }
): Promise<{ id: string }> {
  const coupon = await requireCoupon(container, id)
  const settings = await resolveCoupons(container).getSettings()
  const batch = coupon.batch_size != null
  const draft = normalizeDraft(
    batch
      ? { ...input.draft, automatic: false, code: null, tiers: null, usage_limit: 1, per_customer_limit: null }
      : input.draft,
    settings.currencyCode
  )
  const before = coupon.draft
  const structural =
    draft.kind !== before.kind ||
    draft.automatic !== before.automatic ||
    (!batch && !draft.automatic && draft.code !== coupon.code) ||
    (draft.tiers?.length ?? 0) !== (before.tiers?.length ?? 0)
  if (structural) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "The code, the kind of discount, automatic or not, and the number of tiers cannot change. Duplicate the coupon instead."
    )
  }
  const report = batch ? validateDraft({ ...draft, code: "BATCH" }) : await reviewDraft(container, draft, id)
  if (report.errors.length) throw invalid(report)

  const byCode = new Map(coupon.promotions.map((p) => [p.code, p.id]))
  let specs: PromotionSpec[]
  if (batch) {
    specs = coupon.promotions.map((p) => {
      const [spec] = buildPromotions({ ...draft, code: p.code }, p.code)
      return { ...spec, metadata: { ...spec.metadata, coupons_group: coupon.code } }
    })
  } else {
    specs = buildPromotions(draft, coupon.code)
  }
  const pairs = specs.map((spec) => {
    const promotionId = byCode.get(spec.code)
    if (!promotionId) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `Promotion ${spec.code} of this coupon is missing in Medusa promotions.`
      )
    }
    return { id: promotionId, spec }
  })
  const campaign = buildCampaign(draft, coupon.code)
  await updateCouponsCouponWorkflow(container).run({
    input: {
      row: { id, name: input.name ?? coupon.name, exclusive: draft.exclusive, draft },
      campaign: coupon.campaign_id
        ? {
            id: coupon.campaign_id,
            starts_at: campaign.starts_at,
            ends_at: campaign.ends_at,
            ...(coupon.tiered ? { budget_limit: draft.usage_limit ?? null } : {}),
          }
        : null,
      pairs,
    },
  })
  return { id }
}

export async function setStatus(container: MedusaContainer, id: string, status: "active" | "paused"): Promise<void> {
  const coupon = await requireCoupon(container, id)
  await setCouponsCouponStatusWorkflow(container).run({
    input: { promotion_ids: coupon.promotions.map((p) => p.id), status: status === "paused" ? "inactive" : "active" },
  })
}

export async function deleteCoupon(container: MedusaContainer, id: string): Promise<void> {
  const coupon = await requireCoupon(container, id)
  await deleteCouponsCouponWorkflow(container).run({
    input: { id, promotion_ids: coupon.promotions.map((p) => p.id), campaign_id: coupon.campaign_id },
  })
}

/** A paused copy with a free code, for the owner to review before resuming. */
export async function duplicateCoupon(container: MedusaContainer, id: string): Promise<{ id: string }> {
  const coupon = await requireCoupon(container, id)
  if (coupon.batch_size != null) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Batches cannot be duplicated. Create a new batch instead.")
  }
  let code: string | null = null
  if (!coupon.automatic) {
    const taken = new Set((await loadCoupons(container)).map((c) => c.code))
    const promotionModule = container.resolve<IPromotionModuleService>(Modules.PROMOTION)
    for (let n = 2; n < 100 && !code; n++) {
      const candidate = `${coupon.code}-${n}`.slice(0, 40)
      if (taken.has(candidate)) continue
      const used = await promotionModule.listPromotions({ code: [candidate] }, { select: ["id"] })
      if (!used.length) code = candidate
    }
    code ??= randomCode(10)
  }
  return createCoupon(container, { draft: { ...coupon.draft, code }, name: coupon.name, paused: true })
}

/* Reading ----------------------------------------------------------------- */

export type DashboardCards = {
  total: number
  active: number
  scheduled: number
  expiring: number
  automatic: number
  orders_30d: number
  discount_30d: number
  currency_code: string
}

/** All coupons as list rows, plus the cards at the top of the panel. */
export async function dashboard(
  container: MedusaContainer,
  now = new Date()
): Promise<{ coupons: CouponView[]; cards: DashboardCards }> {
  const service = resolveCoupons(container)
  const [options, settings] = await Promise.all([service.getOptions(), service.getSettings()])
  const coupons = await loadCoupons(container)
  const views = (await buildViews(container, coupons, now, options.timeZone)).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )

  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const recent = await loadOrdersForPromotions(
    container,
    coupons.flatMap((c) => c.promotions.map((p) => p.id)),
    since
  )
  const recentStats = statsByCode(recent)
  const ownCodes = new Set(coupons.flatMap((c) => c.promotions.map((p) => p.code)))
  const recentOwn = recent.filter((order) => order.adjustments.some((a) => a.code && ownCodes.has(a.code)))
  const discount = sumStats(
    [...recentStats.entries()].filter(([code]) => ownCodes.has(code)).map(([, s]) => s)
  ).discount

  return {
    coupons: views,
    cards: {
      total: views.length,
      active: views.filter((v) => v.status === "active").length,
      scheduled: views.filter((v) => v.status === "scheduled").length,
      expiring: views.filter((v) => v.expiring).length,
      automatic: views.filter((v) => v.automatic).length,
      orders_30d: recentOwn.length,
      discount_30d: discount,
      currency_code: settings.currencyCode,
    },
  }
}

export async function couponDetail(container: MedusaContainer, id: string, now = new Date()): Promise<CouponView> {
  const coupon = await requireCoupon(container, id)
  const { timeZone } = await resolveCoupons(container).getOptions()
  const [view] = await buildViews(container, [coupon], now, timeZone)
  return view
}

export type CouponOrder = {
  id: string
  display_id: number | null
  created_at: string
  email: string | null
  total: number
  currency_code: string
  discount: number
  codes: string[]
}

/** Orders that used a coupon, newest first. */
export async function couponOrders(container: MedusaContainer, id: string): Promise<CouponOrder[]> {
  const coupon = await requireCoupon(container, id)
  const codes = new Set(coupon.promotions.map((p) => p.code))
  const orders = await loadOrdersForPromotions(
    container,
    coupon.promotions.map((p) => p.id)
  )
  return orders.map((order) => {
    const own = order.adjustments.filter((a) => a.code && codes.has(a.code))
    return {
      id: order.id,
      display_id: order.display_id,
      created_at: String(order.created_at),
      email: order.email,
      total: order.total,
      currency_code: order.currency_code,
      discount: Math.round(own.reduce((sum, a) => sum + a.amount, 0) * 100) / 100,
      codes: [...new Set(own.map((a) => a.code!))],
    }
  })
}

export type BatchCode = {
  code: string
  used: boolean
  status: string
  order_id: string | null
  order_display_id: number | null
  used_at: string | null
}

/** Every code of a batch: used or not, and in which order. */
export async function batchCodes(container: MedusaContainer, id: string): Promise<BatchCode[]> {
  const coupon = await requireCoupon(container, id)
  if (coupon.batch_size == null) throw new MedusaError(MedusaError.Types.INVALID_DATA, "This coupon is not a batch.")
  const orders = await loadOrdersForPromotions(
    container,
    coupon.promotions.map((p) => p.id)
  )
  const orderByCode = new Map<string, (typeof orders)[number]>()
  for (const order of [...orders].reverse()) {
    for (const a of order.adjustments) if (a.code && !orderByCode.has(a.code)) orderByCode.set(a.code, order)
  }
  return coupon.promotions
    .map((p) => {
      const order = orderByCode.get(p.code)
      return {
        code: p.code,
        used: p.used >= (p.limit ?? 1) || !!order,
        status: p.status,
        order_id: order?.id ?? null,
        order_display_id: order?.display_id ?? null,
        used_at: order ? String(order.created_at) : null,
      }
    })
    .sort((a, b) => a.code.localeCompare(b.code))
}

/** Sentence and preview data for the wizard, without saving anything. */
export async function previewDraft(
  container: MedusaContainer,
  input: { draft: CouponDraft; id?: string }
): Promise<{ report: DraftReport; sentence: Record<Locale, string> }> {
  const service = resolveCoupons(container)
  const [options, settings] = await Promise.all([service.getOptions(), service.getSettings()])
  const draft = normalizeDraft(input.draft, settings.currencyCode)
  const report = await reviewDraft(container, draft, input.id)
  const names = await loadNames(container, {
    categories: draft.category_ids,
    groups: draft.audience === "groups" ? draft.audience_ids : [],
    products: draft.buy_product_ids,
  })
  return {
    report,
    sentence: {
      pl: describeCoupon(draft, "pl", { names, timeZone: options.timeZone }),
      en: describeCoupon(draft, "en", { names, timeZone: options.timeZone }),
    },
  }
}

export type { CodeStats }
