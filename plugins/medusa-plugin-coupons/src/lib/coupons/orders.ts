/** An order as the stats need it: its totals and the promotion adjustments on its items and shipping. */
export type OrderForStats = {
  id: string
  display_id: number | null
  created_at: Date | string
  email: string | null
  customer_id: string | null
  currency_code: string
  total: number
  /** Every adjustment of the order, items and shipping methods together. */
  adjustments: Array<{ code: string | null; amount: number }>
}

export type CodeStats = { orders: number; discount: number; revenue: number }

/**
 * Orders, discount and revenue per promotion code. An order counts once per
 * code even when the code adjusted several of its lines; revenue is the
 * order total after discounts.
 */
export function statsByCode(orders: OrderForStats[]): Map<string, CodeStats> {
  const result = new Map<string, CodeStats>()
  for (const order of orders) {
    const discountByCode = new Map<string, number>()
    for (const adjustment of order.adjustments) {
      if (!adjustment.code) continue
      discountByCode.set(adjustment.code, (discountByCode.get(adjustment.code) ?? 0) + Number(adjustment.amount || 0))
    }
    for (const [code, discount] of discountByCode) {
      const entry = result.get(code) ?? { orders: 0, discount: 0, revenue: 0 }
      entry.orders += 1
      entry.discount = round2(entry.discount + discount)
      entry.revenue = round2(entry.revenue + Number(order.total || 0))
      result.set(code, entry)
    }
  }
  return result
}

/** Sums stats of several codes, e.g. the levels of a tiered coupon or the codes of a batch. */
export function sumStats(parts: Array<CodeStats | undefined>): CodeStats {
  const total = { orders: 0, discount: 0, revenue: 0 }
  for (const part of parts) {
    if (!part) continue
    total.orders += part.orders
    total.discount = round2(total.discount + part.discount)
    total.revenue = round2(total.revenue + part.revenue)
  }
  return total
}

/** Codes an order used, in the order they first appear. */
export function codesOfOrder(order: Pick<OrderForStats, "adjustments">): string[] {
  return [...new Set(order.adjustments.map((a) => a.code).filter((code): code is string => !!code))]
}

const round2 = (value: number) => Math.round(value * 100) / 100
