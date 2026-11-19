import type { MedusaContainer } from "@medusajs/framework/types"

import { type SetupStep, setupStep } from "../kit/setup"
import { graph, resolveNegotiations } from "./runtime"

/** The installation steps, each with a status detected from this store. Texts live in the admin translations. */
export async function guideSteps(container: MedusaContainer): Promise<SetupStep[]> {
  const s = resolveNegotiations(container)
  const enabled = await s.isEnabled()
  if (!enabled) return [setupStep("install", false), setupStep("migrations", false)]
  const options = await s.getOptions()
  const settings = await s.getSettings()
  const [threads, floors] = await Promise.all([
    s.listNegotiationThreads({ is_demo: false }, { take: 1, select: ["id"] }),
    s.listNegotiationVariantFloors({}, { take: 1, select: ["id"] }),
  ])

  // Customer groups are optional; once listed, each must exist in the store.
  let missingGroups = 0
  if (options.allowedCustomerGroups.length) {
    const { data } = await graph(container)({ entity: "customer_group", fields: ["id", "name"] })
    const known = new Set(data.flatMap((g) => [String(g.id).toLowerCase(), String(g.name ?? "").toLowerCase()]))
    missingGroups = options.allowedCustomerGroups.filter((g) => !known.has(g.toLowerCase())).length
  }
  const groups = options.allowedCustomerGroups.length
    ? setupStep("groups", missingGroups === 0, {
        params: { count: options.allowedCustomerGroups.length, missing: missingGroups },
      })
    : setupStep("groups", false, { optional: true, params: { count: 0, missing: 0 } })

  return [
    setupStep("install", true),
    setupStep("migrations", true),
    groups,
    setupStep("storefront", threads.length > 0),
    setupStep("floors", floors.length > 0, { optional: true }),
    // Nothing in the store shows whether something listens to negotiation.* events.
    setupStep("events", null, { optional: true }),
    setupStep("expiry", options.expiryDays > 0, { optional: true, params: { days: options.expiryDays } }),
    setupStep("draft_orders", options.writers.draftOrders && settings.armed.draft_orders, { optional: true }),
    setupStep("cart", options.writers.cart && settings.armed.cart, { optional: true }),
    setupStep("production", !options.demo),
  ]
}
