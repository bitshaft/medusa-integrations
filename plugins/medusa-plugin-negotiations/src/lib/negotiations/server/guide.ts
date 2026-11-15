import type { MedusaContainer } from "@medusajs/framework/types"

import { graph, resolveNegotiations } from "./runtime"

export type GuideStatus = "done" | "todo" | "optional"
export type GuideStep = { id: string; status: GuideStatus; params?: Record<string, string | number> }

/** The rollout steps, each with a status detected from this store. Texts live in the admin translations. */
export async function guideSteps(container: MedusaContainer): Promise<GuideStep[]> {
  const s = resolveNegotiations(container)
  const enabled = await s.isEnabled()
  const options = await s.getOptions()
  const settings = await s.getSettings()
  const [threads, floors] = await Promise.all([
    s.listNegotiationThreads({ is_demo: false }, { take: 1, select: ["id"] }),
    s.listNegotiationVariantFloors({}, { take: 1, select: ["id"] }),
  ])

  let groupsStatus: GuideStatus = "optional"
  let missingGroups = 0
  if (options.allowedCustomerGroups.length) {
    const { data } = await graph(container)({ entity: "customer_group", fields: ["id", "name"] })
    const known = new Set(data.flatMap((g) => [String(g.id).toLowerCase(), String(g.name ?? "").toLowerCase()]))
    missingGroups = options.allowedCustomerGroups.filter((g) => !known.has(g.toLowerCase())).length
    groupsStatus = missingGroups ? "todo" : "done"
  }

  const writer = (on: boolean, armed: boolean): GuideStatus => (!on ? "optional" : armed ? "done" : "todo")

  return [
    { id: "install", status: enabled ? "done" : "todo" },
    { id: "migrations", status: enabled ? "done" : "todo" },
    {
      id: "groups",
      status: groupsStatus,
      params: { count: options.allowedCustomerGroups.length, missing: missingGroups },
    },
    { id: "storefront", status: threads.length ? "done" : "todo" },
    { id: "floors", status: floors.length ? "done" : "optional" },
    { id: "events", status: "optional" },
    { id: "expiry", status: options.expiryDays > 0 ? "done" : "optional", params: { days: options.expiryDays } },
    { id: "draft_orders", status: writer(options.writers.draftOrders, settings.armed.draft_orders) },
    { id: "cart", status: writer(options.writers.cart, settings.armed.cart) },
    { id: "production", status: options.demo ? "todo" : "done" },
  ]
}
