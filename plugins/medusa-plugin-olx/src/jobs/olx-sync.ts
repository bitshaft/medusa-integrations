import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { runSync } from "../lib/olx/engine"
import { engineIfReady } from "../lib/olx/runtime"

/**
 * Every 5 minutes: settles creates whose answer was lost, takes down adverts
 * of items that are gone (in case a stock event was missed), repeats failed
 * take-downs and reads what changed on OLX.
 */
export default async function olxSync(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const engine = await engineIfReady(container)
    if (!engine) {
      return
    }
    const summary = await runSync(engine)
    if (summary.resolved || summary.taken_down || summary.retried || summary.changed) {
      logger.info(
        `[olx] Sync: ${summary.resolved} settled, ${summary.taken_down} taken down, ` +
          `${summary.retried} retried, ${summary.changed} changed on OLX`
      )
    }
    for (const error of summary.errors) {
      logger.warn(`[olx] Sync problem (${error}). It will be tried again in 5 minutes.`)
    }
  } catch (error) {
    logger.error(`[olx] Sync failed: ${(error as Error).message}. It will be tried again in 5 minutes.`)
  }
}

export const config = {
  name: "olx-sync",
  schedule: "*/5 * * * *",
}
