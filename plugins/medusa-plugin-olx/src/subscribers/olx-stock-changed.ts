import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { checkStock } from "../lib/olx/engine"
import { engineIfReady } from "../lib/olx/runtime"
import { STOCK_EVENTS, type StockEventName, variantsForEvent } from "../lib/olx/stock-events"

/**
 * Takes an advert down as soon as its item can no longer be bought in the
 * store. A failure is logged only: the sync job checks the same thing every
 * 5 minutes. Stock coming back never republishes anything by itself.
 */
export default async function olxStockChanged({ event, container }: SubscriberArgs<Record<string, unknown>>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const engine = await engineIfReady(container)
    if (!engine) {
      return
    }
    const variants = await variantsForEvent(container, event.name as StockEventName, event.data)
    const count = await checkStock(engine, variants)
    if (count) {
      logger.info(`[olx] Took down ${count} advert(s) after ${event.name}`)
    }
  } catch (error) {
    logger.warn(`[olx] Could not check adverts after ${event.name}: ${(error as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: Object.keys(STOCK_EVENTS),
  context: { subscriberId: "olx-stock-changed" },
}
