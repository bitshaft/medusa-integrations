import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import type { SubscriptionStatus } from "../../modules/back-in-stock/models/subscription"
import type { DeliveryResult } from "./deliver"
import { buildView, type EngineDependencies } from "./engine"
import { BackInStockEvents } from "./events"
import { localeCode, normalizeLocale } from "./options"
import { engineFor, resolveBackInStock } from "./runtime"
import type { SubscriptionRecord } from "./types"

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

export type SubscribeInput = {
  email: string
  variant_id: string
  sales_channel_id: string
  customer_id?: string | null
  locale?: string | null
  country_code?: string | null
  /** Created by demo mode: never sent, removed with the demo data. */
  demo?: boolean
}

export type SubscribeResult = {
  subscription: SubscriptionRecord
  /** False when an open subscription for this email, variant and channel already existed. */
  created: boolean
  /** A confirmation email was sent (double opt-in). */
  confirmation_sent: boolean
}

async function requireEngine(container: MedusaContainer): Promise<EngineDependencies> {
  const engine = await engineFor(container)
  if (!engine) {
    const reason = await resolveBackInStock(container).getDisabledReason()
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `The back-in-stock plugin is disabled: ${reason}`)
  }
  return engine
}

/**
 * Subscribes an email address to a variant in a sales channel.
 *
 * Refuses variants that can be ordered now (in stock, not stock-managed or
 * backorderable): there is nothing to wait for. Subscribing again with the
 * same email returns the open subscription instead of creating another.
 * Records the variant as out of stock, which is the starting point for
 * detecting the restock.
 */
export async function subscribe(container: MedusaContainer, input: SubscribeInput): Promise<SubscribeResult> {
  const engine = await requireEngine(container)
  const service = resolveBackInStock(container)
  const email = input.email.trim().toLowerCase()
  if (!EMAIL.test(email) || email.length > 254) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a valid email address.")
  }

  const settings = await engine.settings()
  const availability = (
    await engine.availability([input.variant_id], input.sales_channel_id, settings.minQuantity)
  ).get(input.variant_id)
  if (!availability || availability.reason === "missing") {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant ${input.variant_id} was not found.`)
  }
  if (availability.in_stock) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This variant is in stock and can be ordered now, so there is nothing to notify about.",
      "variant_in_stock"
    )
  }

  const pair = { variant_id: input.variant_id, sales_channel_id: input.sales_channel_id }
  // Kept as a full code (`de-DE`): the emails plugin picks the store language from it.
  const locale = localeCode(input.locale, engine.options.defaultLocale)
  const existing = await findOpen(container, email, pair)
  if (existing) {
    // Someone may have lost the confirmation email: send it again.
    const resent = existing.status === "pending" && (await sendConfirmation(engine, existing))
    return { subscription: existing, created: false, confirmation_sent: resent }
  }

  const products = await engine.products([input.variant_id])
  const product = products.get(input.variant_id)
  let subscription: SubscriptionRecord
  try {
    subscription = (await service.createBackInStockSubscriptions({
      email,
      ...pair,
      product_id: product?.product_id ?? null,
      customer_id: input.customer_id ?? null,
      locale,
      country_code: input.country_code?.trim().toLowerCase() || null,
      status: settings.doubleOptIn ? "pending" : "active",
      confirmed_at: settings.doubleOptIn ? null : new Date(),
      consent_text: settings.consent[normalizeLocale(locale, engine.options.defaultLocale)],
      demo: input.demo === true,
    })) as unknown as SubscriptionRecord
  } catch (error) {
    // The same person subscribed twice at once; the unique index let one through.
    const raced = await findOpen(container, email, pair)
    if (!raced) {
      throw error
    }
    return { subscription: raced, created: false, confirmation_sent: false }
  }

  await engine.store.saveState({
    ...pair,
    in_stock: false,
    available: availability.available,
    reason: availability.reason,
    checked_at: new Date(),
    restocked_at: (await engine.store.getState(pair))?.restocked_at ?? null,
  })

  const confirmationSent = subscription.status === "pending" ? await sendConfirmation(engine, subscription) : false
  await engine.emit(BackInStockEvents.SUBSCRIBED, {
    id: subscription.id,
    ...pair,
    customer_id: subscription.customer_id,
    status: subscription.status,
  })
  return { subscription, created: true, confirmation_sent: confirmationSent }
}

async function findOpen(
  container: MedusaContainer,
  email: string,
  pair: { variant_id: string; sales_channel_id: string }
): Promise<SubscriptionRecord | null> {
  const [row] = await resolveBackInStock(container).listBackInStockSubscriptions(
    { email, ...pair, status: ["pending", "active"] },
    { take: 1 }
  )
  return (row as unknown as SubscriptionRecord) ?? null
}

/** Sends the double opt-in email with a fresh confirm token. */
async function sendConfirmation(engine: EngineDependencies, subscription: SubscriptionRecord): Promise<boolean> {
  if (!subscription.email) {
    return false
  }
  const product = (await engine.products([subscription.variant_id])).get(subscription.variant_id)
  if (!product) {
    return false
  }
  const notificationId = await engine.store.claimNotification(subscription, "confirm", null)
  if (!notificationId) {
    return false
  }
  let result: DeliveryResult
  try {
    const token = await engine.store.issueToken(subscription.id, "confirm")
    const { view, one_click } = await buildView(engine, subscription, product, await engine.storeName(), "confirm", token)
    result = await engine.deliver({
      to: subscription.email,
      view,
      dedupe_key: `back-in-stock:${notificationId}`,
      demo: engine.options.demo || subscription.demo,
      customer_id: subscription.customer_id,
      subscription_id: subscription.id,
      one_click_unsubscribe: one_click,
    })
  } catch (error) {
    // Closed as failed, so the claim does not block the next email.
    result = { status: "failed", via: "notification", error: (error as Error).message }
  }
  await engine.store.completeNotification(notificationId, subscription, result, new Date())
  return result.status === "sent" || result.status === "demo"
}

export type TokenActionResult = {
  /** `done`: this call changed it; `already`: nothing left to do; `invalid`: unknown or ended. */
  outcome: "done" | "already" | "invalid"
  subscription: SubscriptionRecord | null
}

/** Activates a pending subscription (double opt-in). Safe to repeat. */
export async function confirmByToken(container: MedusaContainer, token: string): Promise<TokenActionResult> {
  const service = resolveBackInStock(container)
  const found = await service.findByToken(token, "confirm")
  if (!found) {
    return { outcome: "invalid", subscription: null }
  }
  const { subscription } = found
  if (subscription.status === "active") {
    return { outcome: "already", subscription }
  }
  if (subscription.status !== "pending") {
    return { outcome: "invalid", subscription }
  }
  const now = new Date()
  const updated = (await service.updateBackInStockSubscriptions({
    id: subscription.id,
    status: "active",
    confirmed_at: now,
  })) as unknown as SubscriptionRecord
  await service.updateBackInStockTokens({ id: found.token_id, used_at: now })
  return { outcome: "done", subscription: updated }
}

/** Ends a subscription from an unsubscribe link. Safe to repeat. */
export async function unsubscribeByToken(container: MedusaContainer, token: string): Promise<TokenActionResult> {
  const service = resolveBackInStock(container)
  const found = await service.findByToken(token, "unsubscribe")
  if (!found) {
    return { outcome: "invalid", subscription: null }
  }
  return endSubscription(container, found.subscription, "unsubscribed")
}

/** Ends an open subscription; ended ones are left as they are. */
export async function endSubscription(
  container: MedusaContainer,
  subscription: SubscriptionRecord,
  status: Extract<SubscriptionStatus, "unsubscribed" | "purchased" | "expired">
): Promise<TokenActionResult> {
  if (subscription.status !== "pending" && subscription.status !== "active") {
    return { outcome: "already", subscription }
  }
  const updated = (await resolveBackInStock(container).updateBackInStockSubscriptions({
    id: subscription.id,
    status,
    ended_at: new Date(),
  })) as unknown as SubscriptionRecord
  return { outcome: "done", subscription: updated }
}
