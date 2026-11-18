import type { MedusaContainer } from "@medusajs/framework/types"
import { generateEntityId, Modules } from "@medusajs/framework/utils"

import { buildDemoData, DEMO_PROFILES } from "../demo"
import { graph, programCurrency, resolveLoyalty } from "./runtime"

/** Below this many registered customers, sample customers are added so every profile has someone. */
const MIN_CUSTOMERS = 6

/** Sample customers added to a store with too few of its own. Reused on every restore (by e-mail). */
const SAMPLE_CUSTOMERS = [
  { email: "demo.ewa.malinowska@example.com", first_name: "Ewa", last_name: "Malinowska" },
  { email: "demo.tomasz.wrobel@example.com", first_name: "Tomasz", last_name: "Wróbel" },
  { email: "demo.julia.kaczmarek@example.com", first_name: "Julia", last_name: "Kaczmarek" },
  { email: "demo.marek.lewandowski@example.com", first_name: "Marek", last_name: "Lewandowski" },
  { email: "demo.ola.szymanska@example.com", first_name: "Aleksandra", last_name: "Szymańska" },
  { email: "demo.pawel.dabrowski@example.com", first_name: "Paweł", last_name: "Dąbrowski" },
]

export type ResetResult = { customers: number; created_customers: number; entries: number; rewards: number }

/**
 * "Restore test data" (demo mode only): replaces the whole program with
 * the demo set. Uses the store's registered customers (oldest first, up to
 * eight); a store with fewer than six gets sample customers marked with
 * `metadata.loyalty_demo`. The gift reward uses the first published
 * product variant.
 */
export async function resetLoyaltyDemo(
  container: MedusaContainer,
  input: { actorId?: string | null; now?: Date } = {}
): Promise<ResetResult> {
  const service = resolveLoyalty(container)
  const current = await service.getSettings()
  const query = graph(container)

  const { data: customers } = await query({
    entity: "customer",
    fields: ["id", "email"],
    filters: { has_account: true },
    pagination: { take: DEMO_PROFILES, order: { created_at: "ASC" } },
  })
  const ids = customers.map((c) => c.id as string)
  let created = 0
  if (ids.length < MIN_CUSTOMERS) {
    const added = await sampleCustomers(container, MIN_CUSTOMERS - ids.length, new Set(customers.map((c) => c.email)))
    created = added.created
    ids.push(...added.ids)
  }

  const { data: variants } = await query({
    entity: "variant",
    fields: ["id", "product.status"],
    pagination: { take: 50 },
  })
  const gift = variants.find((v) => v?.product?.status === "published")?.id ?? null

  const data = buildDemoData({
    now: input.now ?? new Date(),
    customers: ids,
    giftVariantId: gift,
    currency: await programCurrency(container, current),
    current,
    actorId: input.actorId ?? null,
    id: (prefix) => generateEntityId(undefined, prefix),
  })
  await service.replaceWithDemo(data)
  return {
    customers: data.accounts.length,
    created_customers: created,
    entries: data.entries.length,
    rewards: data.rewards.length,
  }
}

/** Sample customers, reusing ones an earlier restore created. */
async function sampleCustomers(container: MedusaContainer, count: number, taken: Set<string>) {
  const customerModule = container.resolve(Modules.CUSTOMER) as {
    listCustomers(filters: Record<string, unknown>): Promise<Array<{ id: string; email: string }>>
    createCustomers(data: Array<Record<string, unknown>>): Promise<Array<{ id: string }>>
  }
  const wanted = SAMPLE_CUSTOMERS.filter((c) => !taken.has(c.email)).slice(0, count)
  const existing = await customerModule.listCustomers({ email: wanted.map((c) => c.email) })
  const known = new Set(existing.map((c) => c.email))
  const missing = wanted.filter((c) => !known.has(c.email))
  const made = missing.length
    ? await customerModule.createCustomers(
        missing.map((c) => ({ ...c, has_account: true, metadata: { loyalty_demo: true } }))
      )
    : []
  const byEmail = new Map(existing.map((c) => [c.email, c.id]))
  missing.forEach((c, i) => byEmail.set(c.email, made[i].id))
  return { ids: wanted.map((c) => byEmail.get(c.email)!).filter(Boolean), created: made.length }
}
