import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { type CheckOutcome, runCheck } from "./engine"
import { engineFor, resolveBackInStock } from "./runtime"
import type { SubscriptionRecord } from "./types"

const CANDIDATES = 200

/**
 * Creates sample subscriptions from the store's own catalog: variants that
 * are out of stock in the sales channel (any variants when none are), one
 * subscription per address and variant. They are marked `demo`, so their
 * emails are only rendered and logged, never sent.
 */
export async function seedDemo(
  container: MedusaContainer,
  input: { emails: string[]; count: number; sales_channel_id?: string; locale?: string }
): Promise<{ created: number; variants: string[]; sales_channel_id: string }> {
  const engine = await engineFor(container)
  if (!engine) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The back-in-stock plugin is disabled")
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const channelId = input.sales_channel_id ?? (await firstSalesChannel(container))
  if (!channelId) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "The store has no sales channel to create demo subscriptions in."
    )
  }

  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product_id"],
    pagination: { take: CANDIDATES, skip: 0, order: { created_at: "DESC" } },
  })
  const variants = data as unknown as Array<{ id: string; product_id: string | null }>
  if (!variants.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "The store has no products to create demo subscriptions for.")
  }
  const settings = await engine.settings()
  const availability = await engine.availability(
    variants.map((variant) => variant.id),
    channelId,
    settings.minQuantity
  )
  const outOfStock = variants.filter((variant) => !availability.get(variant.id)?.in_stock)
  const chosen = (outOfStock.length ? outOfStock : variants).slice(0, input.count)

  const service = resolveBackInStock(container)
  const now = new Date()
  let created = 0
  for (const variant of chosen) {
    for (const email of input.emails) {
      try {
        await service.createBackInStockSubscriptions({
          email: email.trim().toLowerCase(),
          variant_id: variant.id,
          product_id: variant.product_id,
          sales_channel_id: channelId,
          locale: input.locale ?? engine.options.defaultLocale,
          status: "active",
          confirmed_at: now,
          consent_text: settings.consent[engine.options.defaultLocale],
          demo: true,
        })
        created++
      } catch {
        // This address already waits for this variant.
      }
    }
    await engine.store.saveState({
      variant_id: variant.id,
      sales_channel_id: channelId,
      in_stock: false,
      available: availability.get(variant.id)?.available ?? null,
      reason: availability.get(variant.id)?.reason ?? null,
      checked_at: now,
      restocked_at: null,
    })
  }
  return { created, variants: chosen.map((variant) => variant.id), sales_channel_id: channelId }
}

/**
 * Runs the whole notification pipeline for a variant as if it had just come
 * back, for its demo subscriptions only, without touching inventory. Emails
 * are rendered and logged.
 */
export async function simulateRestock(
  container: MedusaContainer,
  pair: { variant_id: string; sales_channel_id: string }
): Promise<CheckOutcome> {
  const engine = await engineFor(container)
  if (!engine) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The back-in-stock plugin is disabled")
  }
  const now = new Date()
  const { check } = await engine.store.upsertCheck(pair, now, now, true)
  return runCheck(engine, check.id)
}

/** Deletes every demo subscription with its tokens and history. */
export async function deleteDemo(container: MedusaContainer): Promise<number> {
  const service = resolveBackInStock(container)
  const rows = (await service.listBackInStockSubscriptions(
    { demo: true },
    { take: null, select: ["id"] }
  )) as unknown as Array<Pick<SubscriptionRecord, "id">>
  await service.deleteSubscriptionsAndTokens(rows.map((row) => row.id))
  return rows.length
}

async function firstSalesChannel(container: MedusaContainer): Promise<string | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
    filters: { is_disabled: false },
    pagination: { take: 1, skip: 0, order: { created_at: "ASC" } },
  })
  return (data[0] as { id?: string } | undefined)?.id ?? null
}
