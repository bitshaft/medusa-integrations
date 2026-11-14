import type { BaseLine } from "./points"

/** What an "earn" entry stores about its order, so later steps need not read the order again. */
export type EarnMetadata = {
  base_total: number
  lines: BaseLine[]
  multiplier: number
  mode: "gross" | "net"
}

/** What a "return" entry stores: returned units per line and their value, both cumulative. */
export type ReturnMetadata = { returned: Record<string, number>; returned_base: number }

type LedgerRow = {
  reason: string
  order_id: string | null
  created_at: Date | string
  metadata: Record<string, unknown> | null
}

/**
 * Spend counted for tiers: the earning base of orders paid since `since`,
 * minus the value of units returned from them; canceled orders count zero.
 * Read from the ledger only.
 */
export function spendSince(entries: LedgerRow[], since: Date): number {
  const orders = new Map<string, { base: number; returned: number; canceled: boolean }>()
  for (const entry of entries) {
    if (!entry.order_id) continue
    const order = orders.get(entry.order_id) ?? { base: 0, returned: 0, canceled: false }
    if (entry.reason === "earn" && new Date(entry.created_at).getTime() >= since.getTime()) {
      order.base = Number((entry.metadata as EarnMetadata | null)?.base_total ?? 0)
    } else if (entry.reason === "return") {
      order.returned = Math.max(order.returned, Number((entry.metadata as ReturnMetadata | null)?.returned_base ?? 0))
    } else if (entry.reason === "cancel") {
      order.canceled = true
    }
    orders.set(entry.order_id, order)
  }
  let total = 0
  for (const order of orders.values()) {
    if (!order.canceled) total += Math.max(0, order.base - order.returned)
  }
  return Math.round(total * 100) / 100
}
