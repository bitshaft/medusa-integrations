import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { scheduleChecks } from "../lib/back-in-stock/engine"
import { engineFor } from "../lib/back-in-stock/runtime"
import { openPairs, STOCK_EVENTS, type StockEventName, variantsForEvent } from "../lib/back-in-stock/targets"

/**
 * Turns stock changes into delayed checks. Inventory levels, reservations
 * (an abandoned cart or a canceled order frees stock) and variant settings
 * (`manage_inventory`, `allow_backorder`) can all change availability. Only
 * variants someone is waiting for are scheduled; the check itself runs
 * after the configured delay (see `back-in-stock-check-due`).
 */
export default async function backInStockStockChanged({ event, container }: SubscriberArgs<Record<string, unknown>>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const engine = await engineFor(container)
    if (!engine) {
      return
    }
    const variants = await variantsForEvent(container, event.name as StockEventName, event.data)
    const pairs = await openPairs(container, variants)
    if (pairs.length) {
      await scheduleChecks(engine, pairs)
    }
  } catch (error) {
    logger.warn(`[back-in-stock] Could not schedule a stock check for ${event.name}: ${(error as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: Object.keys(STOCK_EVENTS),
  context: { subscriberId: "back-in-stock-stock-changed" },
}
