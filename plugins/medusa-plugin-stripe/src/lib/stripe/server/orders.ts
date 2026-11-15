import type { MedusaContainer } from "@medusajs/framework/types"

import { type IntentRef, type OrderRef, sessionIdOf } from "../orders"
import { graph } from "./runtime"

type Row = Record<string, any>

/**
 * Finds the Medusa order of each PaymentIntent: by the payment session id
 * the official provider stores in the intent's metadata, then by Medusa
 * payments that hold the intent id. One query per step, whatever the count.
 */
export async function ordersForIntents(
  container: MedusaContainer,
  intents: IntentRef[]
): Promise<Map<string, OrderRef>> {
  const result = new Map<string, OrderRef>()
  if (!intents.length) return result
  const query = graph(container)

  const bySession = new Map<string, string>()
  for (const intent of intents) {
    const session = sessionIdOf(intent)
    if (session) bySession.set(session, intent.id)
  }
  if (bySession.size) {
    const { data } = await query({
      entity: "payment_session",
      fields: ["id", "data", "payment_collection.order.id", "payment_collection.order.display_id"],
      filters: { id: [...bySession.keys()] },
    })
    for (const session of data as Row[]) {
      const order = session.payment_collection?.order
      const intentId = bySession.get(session.id)
      if (order?.id && intentId) result.set(intentId, { id: order.id, display_id: order.display_id ?? null })
    }
  }

  // Sessions without the metadata (e.g. created before the provider wrote it):
  // look for Medusa payments created by the Stripe providers.
  const missing = intents.filter((i) => !result.has(i.id))
  if (missing.length) {
    const ids = new Set(missing.map((i) => i.id))
    const since = new Date(Math.min(...missing.map((i) => i.created)) * 1000 - 86_400_000)
    const { data } = await query({
      entity: "payment",
      fields: ["id", "data", "provider_id", "payment_collection.order.id", "payment_collection.order.display_id"],
      filters: { provider_id: { $like: "pp_stripe%" }, created_at: { $gte: since } },
      pagination: { take: 2000 },
    })
    for (const payment of data as Row[]) {
      const intentId = payment.data?.id
      const order = payment.payment_collection?.order
      if (typeof intentId === "string" && ids.has(intentId) && order?.id) {
        result.set(intentId, { id: order.id, display_id: order.display_id ?? null })
      }
    }
  }
  return result
}

/** The PaymentIntent ids behind an order's Stripe payments. */
export async function intentsForOrder(container: MedusaContainer, orderId: string): Promise<string[]> {
  const { data } = await graph(container)({
    entity: "order",
    fields: ["id", "payment_collections.payments.data", "payment_collections.payments.provider_id"],
    filters: { id: orderId },
  })
  const ids: string[] = []
  for (const collection of data[0]?.payment_collections ?? []) {
    for (const payment of collection?.payments ?? []) {
      const id = payment?.data?.id
      if (typeof id === "string" && id.startsWith("pi_") && String(payment.provider_id ?? "").startsWith("pp_stripe"))
        ids.push(id)
    }
  }
  return [...new Set(ids)]
}
