import type { Logger } from "@medusajs/framework/types"

import type { VariantAvailability } from "./availability"
import type { DeliveryInput, DeliveryResult } from "./deliver"
import { BackInStockEvents } from "./events"
import { actionLink, type ProductInfo, productLink } from "./links"
import { type BackInStockPluginOptions, normalizeLocale } from "./options"
import { type EmailView, productLabel } from "./render"
import type { EffectiveSettings } from "./settings"
import type { Pair, PendingCheckRecord, SubscriptionRecord, VariantStateRecord } from "./types"

/** A claim older than this belongs to a worker that stopped; the check is run again. */
export const CLAIM_STALE_MS = 5 * 60_000
/** Timers may fire a little early; a check this close to its due time runs. */
const DUE_TOLERANCE_MS = 5_000

/** The persistence the engine needs; the module service implements it. */
export type EngineStore = {
  getCheck(id: string): Promise<PendingCheckRecord | null>
  /** Sets `claimed_at` if the row is unclaimed or its claim is stale; null when someone else holds it. */
  claimCheck(id: string, now: Date, staleBefore: Date): Promise<PendingCheckRecord | null>
  /**
   * Deletes the row after a finished check, or, when events arrived while it
   * ran (`dirty_at` after `claimed_at`), schedules it again for `nextDueAt`.
   */
  finishCheck(check: PendingCheckRecord, nextDueAt: Date): Promise<PendingCheckRecord | null>
  /** Creates the row for a pair, or marks an existing one dirty. */
  upsertCheck(
    pair: Pair,
    now: Date,
    dueAt: Date,
    forced: boolean
  ): Promise<{ check: PendingCheckRecord; created: boolean }>
  getState(pair: Pair): Promise<VariantStateRecord | null>
  saveState(state: VariantStateRecord): Promise<void>
  /** Active subscriptions that may be notified now: under the maximum, outside the gap. */
  listNotifiable(
    pair: Pair,
    rules: { notifiedBefore: Date | null; max: number; demoOnly: boolean }
  ): Promise<SubscriptionRecord[]>
  /**
   * Records an email about to be sent. Returns null when one is already in
   * flight for the subscription, so the same email cannot be sent twice.
   */
  claimNotification(
    subscription: SubscriptionRecord,
    kind: "restock" | "confirm",
    available: number | null
  ): Promise<string | null>
  /** Stores the outcome; for sent and demo emails also counts the notification on the subscription. */
  completeNotification(id: string, subscription: SubscriptionRecord, result: DeliveryResult, now: Date): Promise<void>
  /** Creates a link token and returns it (only its hash is stored). */
  issueToken(subscriptionId: string, purpose: "confirm" | "unsubscribe"): Promise<string>
}

export type EngineDependencies = {
  store: EngineStore
  options: BackInStockPluginOptions
  settings: () => Promise<EffectiveSettings>
  availability: (
    variantIds: string[],
    salesChannelId: string,
    minQuantity: number
  ) => Promise<Map<string, VariantAvailability>>
  products: (variantIds: string[]) => Promise<Map<string, ProductInfo>>
  storeName: () => Promise<string>
  deliver: (input: DeliveryInput) => Promise<DeliveryResult>
  emit: (name: string, data: Record<string, unknown>, delayMs?: number) => Promise<void>
  logger: Logger
  now?: () => Date
}

/* Scheduling --------------------------------------------------------------- */

/**
 * Schedules a stock check for each variant and sales channel after the
 * configured delay. Several events for the same pair within the delay
 * collapse into one check; the first event's due time stays.
 */
export async function scheduleChecks(
  deps: EngineDependencies,
  pairs: Pair[],
  config: { forced?: boolean; delayMs?: number } = {}
): Promise<number> {
  const now = deps.now?.() ?? new Date()
  const delayMs = config.delayMs ?? (await deps.settings()).delayMinutes * 60_000
  let scheduled = 0
  for (const pair of pairs) {
    const { check, created } = await deps.store.upsertCheck(
      pair,
      now,
      new Date(now.getTime() + delayMs),
      config.forced === true
    )
    if (created) {
      await deps.emit(BackInStockEvents.CHECK_DUE, { id: check.id }, delayMs)
      scheduled++
    }
  }
  return scheduled
}

/* Running a check ---------------------------------------------------------- */

export type CheckOutcome =
  | { status: "missing" | "early" | "busy" }
  | {
      status: "done"
      in_stock: boolean
      restocked: boolean
      notified: number
      failed: number
      rescheduled: boolean
    }

/**
 * Runs a due check: claims it, recomputes availability, stores the new state,
 * and on a change from out of stock to in stock notifies every active
 * subscription the guardrails allow. The row is deleted only at the end, so
 * a crash leaves it for the startup hook or the daily job to run again.
 */
export async function runCheck(deps: EngineDependencies, checkId: string): Promise<CheckOutcome> {
  const now = deps.now?.() ?? new Date()
  const row = await deps.store.getCheck(checkId)
  if (!row) {
    return { status: "missing" }
  }
  if (row.due_at.getTime() > now.getTime() + DUE_TOLERANCE_MS && !row.claimed_at) {
    // Delivered early (e.g. re-emitted at startup with a shorter delay): wait for the rest.
    await deps.emit(BackInStockEvents.CHECK_DUE, { id: row.id }, row.due_at.getTime() - now.getTime())
    return { status: "early" }
  }
  const check = await deps.store.claimCheck(row.id, now, new Date(now.getTime() - CLAIM_STALE_MS))
  if (!check) {
    return { status: "busy" }
  }

  const settings = await deps.settings()
  const pair = { variant_id: check.variant_id, sales_channel_id: check.sales_channel_id }
  const availability = (await deps.availability([pair.variant_id], pair.sales_channel_id, settings.minQuantity)).get(
    pair.variant_id
  ) ?? { variant_id: pair.variant_id, in_stock: false, available: null, reason: "missing" as const }

  const previous = await deps.store.getState(pair)
  const restocked = !(previous?.in_stock ?? false) && availability.in_stock
  await deps.store.saveState({
    ...pair,
    in_stock: availability.in_stock,
    available: availability.available,
    reason: availability.reason,
    checked_at: now,
    restocked_at: restocked ? now : (previous?.restocked_at ?? null),
  })

  let notified = 0
  let failed = 0
  if (restocked || check.forced) {
    const subscriptions = await deps.store.listNotifiable(pair, {
      // A forced run (demo "simulate restock") ignores the gap and reaches demo subscriptions only.
      notifiedBefore: check.forced ? null : new Date(now.getTime() - settings.minGapHours * 3_600_000),
      max: settings.maxNotifications,
      demoOnly: check.forced && !restocked,
    })
    if (restocked) {
      await deps.emit(BackInStockEvents.RESTOCKED, {
        ...pair,
        available: availability.available,
        waiting: subscriptions.length,
      })
    }
    if (subscriptions.length) {
      const [products, storeName] = await Promise.all([deps.products([pair.variant_id]), deps.storeName()])
      const product = products.get(pair.variant_id)
      for (const subscription of subscriptions) {
        const result = await notifySubscription(deps, subscription, product, storeName, availability.available, now)
        if (result === "sent") {
          notified++
        } else if (result === "failed") {
          failed++
        }
      }
    }
  }

  const rescheduled = await deps.store.finishCheck(check, new Date(now.getTime() + settings.delayMinutes * 60_000))
  if (rescheduled) {
    await deps.emit(BackInStockEvents.CHECK_DUE, { id: rescheduled.id }, settings.delayMinutes * 60_000)
  }
  return {
    status: "done",
    in_stock: availability.in_stock,
    restocked,
    notified,
    failed,
    rescheduled: Boolean(rescheduled),
  }
}

/** Sends one back-in-stock email. Returns `sent` for delivered and demo emails. */
async function notifySubscription(
  deps: EngineDependencies,
  subscription: SubscriptionRecord,
  product: ProductInfo | undefined,
  storeName: string,
  available: number | null,
  now: Date
): Promise<"sent" | "failed" | "skipped"> {
  if (!subscription.email || !product) {
    return "skipped"
  }
  const notificationId = await deps.store.claimNotification(subscription, "restock", available)
  if (!notificationId) {
    // Another worker is sending to this subscription right now.
    return "skipped"
  }

  const view = await buildView(deps, subscription, product, storeName, "restock")
  const result = await deps.deliver({
    to: subscription.email,
    view: view.view,
    dedupe_key: `back-in-stock:${notificationId}`,
    demo: deps.options.demo || subscription.demo,
    customer_id: subscription.customer_id,
    subscription_id: subscription.id,
    one_click_unsubscribe: view.one_click,
  })
  await deps.store.completeNotification(notificationId, subscription, result, now)

  if (result.status === "sent" || result.status === "demo") {
    await deps.emit(BackInStockEvents.NOTIFIED, {
      id: notificationId,
      subscription_id: subscription.id,
      variant_id: subscription.variant_id,
      sales_channel_id: subscription.sales_channel_id,
      customer_id: subscription.customer_id,
      notification_count: subscription.notification_count + 1,
      demo: result.status === "demo",
    })
    return "sent"
  }
  if (result.status === "failed") {
    deps.logger.warn(
      `[back-in-stock] Could not send the back-in-stock email for subscription ${subscription.id}: ${result.error}. ` +
        "It will be tried again at the next restock."
    )
    return "failed"
  }
  return "skipped"
}

/** The email's content: product, button and a fresh unsubscribe link (or the confirm link). */
export async function buildView(
  deps: Pick<EngineDependencies, "store" | "options">,
  subscription: SubscriptionRecord,
  product: ProductInfo,
  storeName: string,
  kind: "restock" | "confirm",
  confirmToken?: string
): Promise<{ view: EmailView; one_click: boolean }> {
  const locale = normalizeLocale(subscription.locale, deps.options.defaultLocale)
  const unsubscribe = actionLink(
    deps.options,
    "unsubscribe",
    await deps.store.issueToken(subscription.id, "unsubscribe"),
    locale
  )
  const action =
    kind === "confirm" && confirmToken
      ? (actionLink(deps.options, "confirm", confirmToken, locale)?.url ?? null)
      : (productLink(deps.options, product, { country_code: subscription.country_code, locale }) ?? null)
  return {
    view: {
      kind,
      locale,
      store_name: storeName,
      product_title: product.product_title,
      variant_title: product.variant_title,
      product_label: productLabel(product.product_title, product.variant_title),
      thumbnail: product.thumbnail,
      action_url: action,
      unsubscribe_url: unsubscribe?.url ?? null,
    },
    one_click: unsubscribe?.one_click ?? false,
  }
}
