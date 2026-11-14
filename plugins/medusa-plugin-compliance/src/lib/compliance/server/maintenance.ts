import type { MedusaContainer } from "@medusajs/framework/types"

import { purgeBillingData } from "./erasure"
import { recomputeGpsr } from "./gpsr"
import { reviewRequests } from "./requests"
import { moduleOn, resolveCompliance } from "./runtime"

/** The daily job: GPSR completeness, request deadlines and expired links, billing data retention. */
export async function dailyMaintenance(container: MedusaContainer, now = new Date()) {
  const result = { gpsr: { checked: 0, incomplete: 0 }, requests: { expired: 0, warned: 0 }, billing_purged: 0 }
  if (!(await resolveCompliance(container).isEnabled())) return result
  if (await moduleOn(container, "gpsr")) result.gpsr = await recomputeGpsr(container)
  if (await moduleOn(container, "gdpr")) result.requests = await reviewRequests(container, now)
  // Billing data promised for removal is removed even if the GDPR module was switched off since.
  result.billing_purged = await purgeBillingData(container, now)
  return result
}
