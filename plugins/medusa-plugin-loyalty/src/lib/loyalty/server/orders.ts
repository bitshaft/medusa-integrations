import type { MedusaContainer } from "@medusajs/framework/types"

import type { EntryInput } from "../../../modules/loyalty/service"
import { convertBase, currencyFactor, earnedPoints, keptBase, type OrderLine, orderBase, returnTarget } from "../points"
import type { EarnMetadata, ReturnMetadata } from "../spend"
import { emit, graph, logger, LoyaltyEvents, membership, programCurrency, resolveLoyalty } from "./runtime"
import { multiplierOf, recomputeTier } from "./tiers"

/** Marks a cart line as a loyalty gift. Gifts earn nothing and are watched in the cart. */
export const GIFT_METADATA_KEY = "loyalty_redemption_id"

const ORDER_FIELDS = [
  "id",
  "display_id",
  "customer_id",
  "status",
  "created_at",
  "currency_code",
  "items.id",
  "items.quantity",
  "items.total",
  "items.tax_total",
  "items.metadata",
  "items.detail.return_received_quantity",
  "items.adjustments.code",
  "shipping_methods.adjustments.code",
  "payment_collections.amount",
  "payment_collections.captured_amount",
  "payment_collections.status",
  "cart.id",
]

export type LoyaltyOrder = Record<string, any>

export async function loadOrder(container: MedusaContainer, orderId: string): Promise<LoyaltyOrder | null> {
  const { data } = await graph(container)({ entity: "order", fields: ORDER_FIELDS, filters: { id: orderId } })
  return data[0] ?? null
}

/** The order a payment belongs to, through its payment collection. */
export async function orderIdForPayment(container: MedusaContainer, paymentId: string): Promise<string | null> {
  const { data } = await graph(container)({
    entity: "payment",
    fields: ["id", "payment_collection.order.id"],
    filters: { id: paymentId },
  })
  return data[0]?.payment_collection?.order?.id ?? null
}

export function orderLines(order: LoyaltyOrder): OrderLine[] {
  return ((order.items ?? []) as Array<Record<string, any> | null>).filter(Boolean).map((item) => ({
    id: item!.id,
    quantity: Number(item!.quantity ?? 0),
    total: Number(item!.total ?? 0),
    tax_total: Number(item!.tax_total ?? 0),
    is_reward: !!item!.metadata?.[GIFT_METADATA_KEY],
  }))
}

/** Returned units per line, as received in the warehouse. */
export function returnedUnits(order: LoyaltyOrder): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of (order.items ?? []) as Array<Record<string, any> | null>) {
    if (!item) continue
    const received = Number(item.detail?.return_received_quantity ?? item.return_received_quantity ?? 0)
    if (received > 0) result[item.id] = received
  }
  return result
}

/** Fully paid: every live payment collection is captured in full. */
export function isPaid(order: LoyaltyOrder): boolean {
  const collections = ((order.payment_collections ?? []) as Array<Record<string, any> | null>).filter(
    (c) => c && c.status !== "canceled"
  )
  if (!collections.length) return false
  const amount = collections.reduce((sum, c) => sum + Number(c!.amount ?? 0), 0)
  const captured = collections.reduce((sum, c) => sum + Number(c!.captured_amount ?? 0), 0)
  return amount > 0 && captured + 0.005 >= amount
}

async function isFirstOrder(container: MedusaContainer, order: LoyaltyOrder): Promise<boolean> {
  const { data } = await graph(container)({
    entity: "order",
    fields: ["id", "status", "created_at"],
    filters: { customer_id: order.customer_id, created_at: { $lt: order.created_at } },
    pagination: { take: 20 },
  })
  return !data.some((o) => o.status !== "canceled" && o.id !== order.id)
}

export type AwardResult = { status: "earned"; points: number } | { status: "skipped"; reason: string }

/**
 * Points for a paid order: the base (items after discounts, gross or net,
 * no shipping, no gifts) times the rate and the customer's tier
 * multiplier, rounded down; plus the first-order bonus when switched on.
 * Safe to call on every payment and order event: it writes once.
 */
export async function awardOrder(container: MedusaContainer, orderId: string, now = new Date()): Promise<AwardResult> {
  const service = resolveLoyalty(container)
  if (!(await service.isEnabled())) return { status: "skipped", reason: "plugin_disabled" }
  const settings = await service.getSettings()
  if (!settings.enabled) return { status: "skipped", reason: "program_disabled" }

  const order = await loadOrder(container, orderId)
  if (!order) return { status: "skipped", reason: "order_not_found" }
  if (order.status === "canceled") return { status: "skipped", reason: "canceled" }
  const member = await membership(container, order.customer_id, settings.excluded_group_ids)
  if (!member.member) return { status: "skipped", reason: member.reason }
  if (!isPaid(order)) return { status: "skipped", reason: "not_paid" }

  const customerId = order.customer_id as string
  const account = await service.getAccount(customerId)
  const multiplier = multiplierOf(settings, account?.tier_id)
  // Amounts count in the program currency: other currencies by the admin's rate, or not at all.
  const factor = currencyFactor(
    order.currency_code,
    await programCurrency(container, settings),
    settings.currency_rates
  )
  if (factor === null) return { status: "skipped", reason: "currency_without_rate" }
  const base = convertBase(orderBase(orderLines(order), settings.earn.base), factor)
  const points = earnedPoints(base.total, settings.earn, multiplier)
  const label = order.display_id != null ? `#${order.display_id}` : order.id

  const metadata: EarnMetadata = { base_total: base.total, lines: base.lines, multiplier, mode: settings.earn.base }
  const entries: EntryInput[] = [
    {
      key: `order:${order.id}:earn`,
      type: "order",
      reason: "earn",
      points,
      order_id: order.id,
      description: label,
      metadata: metadata as unknown as Record<string, unknown>,
    },
  ]
  const bonus = settings.actions.first_order
  if (bonus.enabled && bonus.points > 0 && (await isFirstOrder(container, order))) {
    entries.push({
      key: `first_order:${customerId}`,
      type: "action",
      reason: "first_order",
      points: bonus.points,
      order_id: order.id,
      description: label,
    })
  }

  const result = await service.post(customerId, entries, { activity: now })
  const earned = result.created.reduce((sum, e) => sum + e.points, 0)
  if (earned > 0) {
    await emit(container, LoyaltyEvents.POINTS_EARNED, {
      customer_id: customerId,
      points: earned,
      reason: "order",
      order_id: order.id,
      balance: result.balance,
      entries: result.created.map((e) => ({ id: e.id, reason: e.reason, points: e.points })),
    })
  }
  if (result.created.length) await recomputeTier(container, customerId, settings, now, "order")
  return result.created.length ? { status: "earned", points: earned } : { status: "skipped", reason: "already_earned" }
}

/**
 * Takes back the share of the points of returned units, by their value
 * at purchase. Cumulative: each return event recomputes the total for the
 * order and writes only the difference.
 */
export async function revertReturnedUnits(container: MedusaContainer, orderId: string, now = new Date()) {
  const service = resolveLoyalty(container)
  if (!(await service.isEnabled())) return { reverted: 0 }
  const [earn] = await service.entriesByKey([`order:${orderId}:earn`])
  if (!earn) return { reverted: 0 }
  const order = await loadOrder(container, orderId)
  if (!order) return { reverted: 0 }

  const meta = earn.metadata as unknown as EarnMetadata
  const returned = returnedUnits(order)
  const target = returnTarget(earn.points, meta.lines ?? [], returned)
  const metadata: ReturnMetadata = {
    returned,
    returned_base: Math.round((meta.base_total - keptBase(meta.lines ?? [], returned)) * 100) / 100,
  }
  const { reverted, balance } = await service.revertOrder(earn.customer_id, orderId, target, "return", metadata)
  if (reverted > 0) {
    await emit(container, LoyaltyEvents.POINTS_REVERTED, {
      customer_id: earn.customer_id,
      points: -reverted,
      reason: "return",
      order_id: orderId,
      balance,
    })
  }
  const settings = await service.getSettings()
  await recomputeTier(container, earn.customer_id, settings, now, "return")
  return { reverted }
}

/** Order canceled: everything earned for it is taken back, and gifts in it are refunded. */
export async function revertCanceledOrder(container: MedusaContainer, orderId: string, now = new Date()) {
  const service = resolveLoyalty(container)
  if (!(await service.isEnabled())) return { reverted: 0 }
  const entries = await service.listLoyaltyEntries({ order_id: orderId }, { take: 1 })
  const redemptions = await service.listLoyaltyRedemptions({ order_id: orderId, status: "ordered" })
  let reverted = 0
  const customerId = entries[0]?.customer_id ?? redemptions[0]?.customer_id
  if (!customerId) return { reverted }

  if (entries.length) {
    const result = await service.revertOrder(customerId, orderId, "all", "cancel")
    reverted = result.reverted
    if (reverted > 0) {
      await emit(container, LoyaltyEvents.POINTS_REVERTED, {
        customer_id: customerId,
        points: -reverted,
        reason: "cancel",
        order_id: orderId,
        balance: result.balance,
      })
    }
  }
  for (const redemption of redemptions) {
    const back = await service.returnRedemption(redemption.id, "released", {
      description: "Order canceled",
      from: ["ordered"],
    })
    if (back.changed) {
      await emit(container, LoyaltyEvents.POINTS_REVERTED, {
        customer_id: customerId,
        points: redemption.cost,
        reason: "gift_order_canceled",
        order_id: orderId,
        redemption_id: redemption.id,
      })
    }
  }
  await recomputeTier(container, customerId, await service.getSettings(), now, "cancel")
  return { reverted }
}

/**
 * Order placed: gifts in its cart become "ordered", and reward codes used
 * in it become "used".
 */
export async function markRewardsOrdered(container: MedusaContainer, orderId: string) {
  const service = resolveLoyalty(container)
  if (!(await service.isEnabled())) return
  const order = await loadOrder(container, orderId)
  if (!order) return
  const cartId = order.cart?.id
  if (cartId) {
    const gifts = await service.listLoyaltyRedemptions({ cart_id: cartId, status: "in_cart" })
    const giftIds = new Set(
      ((order.items ?? []) as Array<Record<string, any> | null>)
        .map((item) => item?.metadata?.[GIFT_METADATA_KEY])
        .filter(Boolean)
    )
    for (const gift of gifts) {
      if (giftIds.has(gift.id))
        await service.updateLoyaltyRedemptions({ id: gift.id, status: "ordered", order_id: orderId })
    }
  }
  const codes = [
    ...new Set(
      [...(order.items ?? []), ...(order.shipping_methods ?? [])]
        .flatMap((line: Record<string, any> | null) => line?.adjustments ?? [])
        .map((a: Record<string, any> | null) => a?.code)
        .filter((code: unknown): code is string => typeof code === "string")
    ),
  ]
  if (codes.length) {
    const used = await service.listLoyaltyRedemptions({ code: codes, status: "issued" })
    for (const redemption of used) {
      await service.updateLoyaltyRedemptions({ id: redemption.id, status: "used", order_id: orderId })
    }
  }
  logger(container).debug(`[loyalty] Rewards of order ${orderId} recorded`)
}
