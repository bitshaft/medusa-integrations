import type { MedusaContainer } from "@medusajs/framework/types"

import { dailyMaintenance } from "../lib/compliance/server/maintenance"
import { logger } from "../lib/compliance/server/runtime"

/** Daily: GPSR completeness, request deadlines and expired links, billing data past retention. */
export default async function complianceDaily(container: MedusaContainer) {
  try {
    const result = await dailyMaintenance(container)
    logger(container).info(
      `[compliance] Daily check: ${result.gpsr.incomplete}/${result.gpsr.checked} products missing GPSR data, ` +
        `${result.requests.warned} requests near the deadline, ${result.requests.expired} links expired, ` +
        `${result.billing_purged} orders' billing data removed`
    )
  } catch (error) {
    logger(container).warn(`[compliance] Daily check failed: ${(error as Error).message}`)
  }
}

export const config = {
  name: "compliance-daily",
  schedule: "20 3 * * *",
}
