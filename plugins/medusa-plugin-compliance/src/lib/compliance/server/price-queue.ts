import type { MedusaContainer } from "@medusajs/framework/types"

import { recordPrices } from "./prices"
import { logger } from "./runtime"

const DELAY_MS = 2_000

let pending: { all: boolean; ids: Set<string>; container: MedusaContainer } | null = null
let timer: NodeJS.Timeout | null = null

/**
 * Collects variants touched by price events and records their prices once
 * the burst is over (a price list update emits one event per price). The
 * hourly job catches anything this misses, e.g. after a restart.
 */
export function queuePriceCheck(container: MedusaContainer, variantIds: string[] | "all") {
  pending ??= { all: false, ids: new Set(), container }
  if (variantIds === "all") pending.all = true
  else variantIds.forEach((id) => pending!.ids.add(id))
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flushPriceChecks(), DELAY_MS)
  timer.unref?.()
}

export async function flushPriceChecks(): Promise<number> {
  if (timer) clearTimeout(timer)
  timer = null
  const batch = pending
  pending = null
  if (!batch || (!batch.all && !batch.ids.size)) return 0
  try {
    const rows = await recordPrices(batch.container, {
      variantIds: batch.all ? undefined : [...batch.ids],
      source: "change",
    })
    return rows.length
  } catch (error) {
    logger(batch.container).warn(`[compliance] Omnibus: recording prices failed: ${(error as Error).message}`)
    return 0
  }
}
