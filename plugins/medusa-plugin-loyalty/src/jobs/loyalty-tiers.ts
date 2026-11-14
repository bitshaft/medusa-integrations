import type { MedusaContainer } from "@medusajs/framework/types"

import { recomputeAllTiers } from "../lib/loyalty/server/maintenance"
import { logger, resolveLoyalty } from "../lib/loyalty/server/runtime"

/** Daily: tiers recomputed, so customers drop once old orders leave the window. */
export default async function loyaltyTiers(container: MedusaContainer) {
  const service = resolveLoyalty(container)
  if (!(await service.isEnabled())) return
  const changed = await recomputeAllTiers(container, await service.getSettings())
  if (changed) logger(container).info(`[loyalty] Tiers changed for ${changed} customer(s)`)
}

export const config = { name: "loyalty-tiers", schedule: "40 3 * * *" }
