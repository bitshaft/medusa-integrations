import type { MedusaContainer } from "@medusajs/framework/types"

import { recordPrices } from "../lib/compliance/server/prices"
import { logger } from "../lib/compliance/server/runtime"

/**
 * Hourly: records every price that changed. Catches discounts that start or
 * end on a schedule (no event is emitted then) and takes the first snapshot.
 */
export default async function compliancePrices(container: MedusaContainer) {
  try {
    const rows = await recordPrices(container, { source: "job" })
    if (rows.length) logger(container).info(`[compliance] Omnibus: ${rows.length} price changes recorded`)
  } catch (error) {
    logger(container).warn(`[compliance] Omnibus: price check failed: ${(error as Error).message}`)
  }
}

export const config = {
  name: "compliance-prices",
  schedule: "5 * * * *",
}
