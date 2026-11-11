import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { resolveBackInStock } from "../lib/back-in-stock/runtime"

/**
 * Daily housekeeping. Applies the retention rules (delete unconfirmed,
 * expire old, remove personal data from ended subscriptions) and re-emits
 * stock checks whose worker stopped. It detects no restocks itself: those
 * come only from inventory events.
 */
export default async function backInStockCleanup(container: MedusaContainer) {
  const service = resolveBackInStock(container)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  if (!(await service.isEnabled())) {
    return
  }
  try {
    const result = await service.applyRetention(await service.getSettings())
    const resumed = await service.resumePendingChecks()
    const changes = Object.entries({ ...result, resumed })
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `${count} ${name}`)
    if (changes.length) {
      logger.info(`[back-in-stock] Cleanup: ${changes.join(", ")}`)
    }
  } catch (error) {
    logger.error(`[back-in-stock] Cleanup failed: ${(error as Error).message}`)
  }
}

export const config = {
  name: "back-in-stock-cleanup",
  schedule: "40 3 * * *",
}
