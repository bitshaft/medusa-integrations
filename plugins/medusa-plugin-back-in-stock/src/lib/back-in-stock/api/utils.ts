import type { MedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveBackInStock } from "../runtime"
import type { NotificationRecord, SubscriptionRecord } from "../types"

/** The module with its options; throws the "disabled" error when the plugin is not configured. */
export async function resolveEnabled(req: MedusaRequest) {
  const service = resolveBackInStock(req.scope)
  const options = await service.getOptions()
  return { service, options }
}

/**
 * The sales channel of a store request: from the body when given (it must
 * belong to the publishable key), otherwise the key's only channel.
 */
export function storeSalesChannel(req: MedusaRequest, requested?: string): string {
  const channels =
    (req as unknown as { publishable_key_context?: { sales_channel_ids?: string[] } }).publishable_key_context
      ?.sales_channel_ids ?? []
  if (requested) {
    if (channels.length && !channels.includes(requested)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "The sales channel is not linked to this publishable API key."
      )
    }
    return requested
  }
  if (channels.length === 1) {
    return channels[0]
  }
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    channels.length
      ? "This publishable API key is linked to several sales channels: pass sales_channel_id."
      : "No sales channel: use a publishable API key linked to a sales channel."
  )
}

/** The logged-in customer's ID, if any. */
export function customerId(req: MedusaRequest): string | null {
  const auth = (req as unknown as { auth_context?: { actor_id?: string; actor_type?: string } }).auth_context
  return auth?.actor_type === "customer" && auth.actor_id ? auth.actor_id : null
}

/** A subscription as the admin shows it (no tokens, no consent snapshot). */
export function describeSubscription(subscription: SubscriptionRecord) {
  return {
    id: subscription.id,
    email: subscription.email,
    variant_id: subscription.variant_id,
    product_id: subscription.product_id,
    sales_channel_id: subscription.sales_channel_id,
    customer_id: subscription.customer_id,
    locale: subscription.locale,
    status: subscription.status,
    notification_count: subscription.notification_count,
    last_notified_at: subscription.last_notified_at,
    confirmed_at: subscription.confirmed_at,
    ended_at: subscription.ended_at,
    anonymized: Boolean(subscription.anonymized_at),
    demo: subscription.demo,
    created_at: subscription.created_at,
  }
}

/** What a customer sees of their own subscription. */
export function describeForCustomer(subscription: SubscriptionRecord) {
  return {
    id: subscription.id,
    variant_id: subscription.variant_id,
    product_id: subscription.product_id,
    sales_channel_id: subscription.sales_channel_id,
    status: subscription.status,
    notification_count: subscription.notification_count,
    last_notified_at: subscription.last_notified_at,
    created_at: subscription.created_at,
  }
}

export function describeNotification(notification: NotificationRecord) {
  return {
    id: notification.id,
    subscription_id: notification.subscription_id,
    variant_id: notification.variant_id,
    sales_channel_id: notification.sales_channel_id,
    kind: notification.kind,
    status: notification.status,
    via: notification.via,
    available: notification.available,
    error: notification.error,
    sent_at: notification.sent_at,
    created_at: notification.created_at,
  }
}

/**
 * A sliding one-minute window per key, in memory. It keeps one visitor from
 * flooding the store routes; behind several instances each counts on its
 * own, which is fine for that purpose.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(private readonly now: () => number = Date.now) {}

  allow(key: string, perMinute: number): boolean {
    const now = this.now()
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < 60_000)
    if (recent.length >= perMinute) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 10_000) {
      for (const [entry, times] of this.hits) {
        if (!times.some((time) => now - time < 60_000)) {
          this.hits.delete(entry)
        }
      }
    }
    return true
  }
}
