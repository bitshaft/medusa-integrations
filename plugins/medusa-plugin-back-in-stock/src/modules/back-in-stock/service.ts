import type { Context, IEventBusModuleService, Logger } from "@medusajs/framework/types"
import { InjectManager, InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"

import type { DeliveryResult } from "../../lib/back-in-stock/deliver"
import { CLAIM_STALE_MS, type EngineStore } from "../../lib/back-in-stock/engine"
import { BackInStockEvents } from "../../lib/back-in-stock/events"
import { logPluginDisabled, pluginDisabledError } from "../../lib/back-in-stock/kit/options"
import { type BackInStockPluginOptions, parseOptions, PLUGIN_NAME } from "../../lib/back-in-stock/options"
import { type EffectiveSettings, mergeSettings, SETTINGS_KEY } from "../../lib/back-in-stock/settings"
import { createToken, hashToken } from "../../lib/back-in-stock/tokens"
import type { Pair, PendingCheckRecord, SubscriptionRecord, VariantStateRecord } from "../../lib/back-in-stock/types"
import { BackInStockNotification } from "./models/notification"
import { BackInStockPendingCheck } from "./models/pending-check"
import { BackInStockSetting } from "./models/setting"
import { BackInStockSubscription, ENDED_STATUSES, OPEN_STATUSES } from "./models/subscription"
import { BackInStockToken, type TokenPurpose } from "./models/token"
import { BackInStockVariantState } from "./models/variant-state"

type InjectedDependencies = { logger: Logger }

type SqlManager = { execute(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }

const toCheck = (row: Record<string, unknown>): PendingCheckRecord => ({
  id: String(row.id),
  variant_id: String(row.variant_id),
  sales_channel_id: String(row.sales_channel_id),
  due_at: new Date(row.due_at as string),
  claimed_at: row.claimed_at ? new Date(row.claimed_at as string) : null,
  dirty_at: row.dirty_at ? new Date(row.dirty_at as string) : null,
  forced: Boolean(row.forced),
})

/**
 * The plugin's own module: subscriptions and their tokens, the sent history,
 * the last known stock state per variant and sales channel, the pending
 * checks, and the settings changed in the admin.
 */
export default class BackInStockModuleService
  extends MedusaService({
    BackInStockSubscription,
    BackInStockToken,
    BackInStockNotification,
    BackInStockVariantState,
    BackInStockPendingCheck,
    BackInStockSetting,
  })
  implements EngineStore
{
  protected readonly logger_: Logger
  private readonly state_: { options: BackInStockPluginOptions } | { disabled: string }

  /** Medusa calls this when the application has started. */
  __hooks = {
    onApplicationStart: async () => {
      try {
        const resumed = await this.resumePendingChecks()
        if (resumed) {
          this.logger_.info(`[${PLUGIN_NAME}] Resumed ${resumed} pending stock check(s)`)
        }
      } catch (error) {
        this.logger_.warn(`[${PLUGIN_NAME}] Could not resume pending stock checks: ${(error as Error).message}`)
      }
    },
  }

  constructor(container: InjectedDependencies, options: Record<string, unknown>) {
    super(...arguments)
    this.logger_ = container.logger
    const parsed = parseOptions(options)
    if (!parsed.enabled) {
      // Never block Medusa's startup over plugin configuration.
      logPluginDisabled(container.logger, PLUGIN_NAME, parsed.reason)
      this.state_ = { disabled: parsed.reason }
      return
    }
    this.state_ = { options: parsed.options }
  }

  /** False when options are missing or invalid; see `getDisabledReason`. */
  async isEnabled(): Promise<boolean> {
    return !("disabled" in this.state_)
  }

  /** Why the plugin is disabled (safe to show: never contains option values). */
  async getDisabledReason(): Promise<string | null> {
    return "disabled" in this.state_ ? this.state_.disabled : null
  }

  async getOptions(): Promise<BackInStockPluginOptions> {
    if ("disabled" in this.state_) {
      throw pluginDisabledError(PLUGIN_NAME, this.state_.disabled)
    }
    return this.state_.options
  }

  /* Settings ---------------------------------------------------------------- */

  async getStoredSettings(): Promise<Record<string, unknown>> {
    const [row] = await this.listBackInStockSettings({ key: SETTINGS_KEY }, { take: 1 })
    return (row?.value as Record<string, unknown>) ?? {}
  }

  async getSettings(): Promise<EffectiveSettings> {
    return mergeSettings(await this.getOptions(), await this.getStoredSettings())
  }

  /** Stores the admin's settings; an empty object goes back to the plugin options. */
  async saveSettings(value: Record<string, unknown>): Promise<void> {
    const [row] = await this.listBackInStockSettings({ key: SETTINGS_KEY }, { take: 1 })
    if (!Object.keys(value).length) {
      if (row) {
        await this.deleteBackInStockSettings(row.id)
      }
      return
    }
    if (row) {
      await this.updateBackInStockSettings({ id: row.id, value })
    } else {
      await this.createBackInStockSettings({ key: SETTINGS_KEY, value })
    }
  }

  /* Pending checks ---------------------------------------------------------- */

  async getCheck(id: string): Promise<PendingCheckRecord | null> {
    const [row] = await this.listBackInStockPendingChecks({ id }, { take: 1 })
    return row ? toCheck(row as unknown as Record<string, unknown>) : null
  }

  /**
   * Claims a check with a single conditional UPDATE, so two workers (or a
   * redelivered event) can never run the same check at once. A claim older
   * than `staleBefore` is taken over: its worker stopped.
   */
  @InjectManager()
  async claimCheck(
    id: string,
    now: Date,
    staleBefore: Date,
    @MedusaContext() context: Context = {}
  ): Promise<PendingCheckRecord | null> {
    return this.claimCheck_(id, now, staleBefore, context)
  }

  @InjectTransactionManager()
  protected async claimCheck_(
    id: string,
    now: Date,
    staleBefore: Date,
    @MedusaContext() context: Context = {}
  ): Promise<PendingCheckRecord | null> {
    const manager = context.transactionManager as unknown as SqlManager
    const rows = await manager.execute(
      `update "back_in_stock_pending_check" set "claimed_at" = ?, "updated_at" = now() ` +
        `where "id" = ? and "deleted_at" is null and ("claimed_at" is null or "claimed_at" < ?) ` +
        `returning "id", "variant_id", "sales_channel_id", "due_at", "claimed_at", "dirty_at", "forced"`,
      [now, id, staleBefore]
    )
    return rows[0] ? toCheck(rows[0]) : null
  }

  async finishCheck(check: PendingCheckRecord, nextDueAt: Date): Promise<PendingCheckRecord | null> {
    const current = await this.getCheck(check.id)
    if (current?.dirty_at && check.claimed_at && current.dirty_at > check.claimed_at) {
      // Stock changed again while the check ran: look once more after the delay.
      const updated = await this.updateBackInStockPendingChecks({
        id: check.id,
        claimed_at: null,
        dirty_at: null,
        forced: false,
        due_at: nextDueAt,
      })
      return toCheck(updated as unknown as Record<string, unknown>)
    }
    await this.deleteBackInStockPendingChecks(check.id)
    return null
  }

  async upsertCheck(
    pair: Pair,
    now: Date,
    dueAt: Date,
    forced: boolean
  ): Promise<{ check: PendingCheckRecord; created: boolean }> {
    const existing = await this.listBackInStockPendingChecks(pair, { take: 1 })
    if (existing[0]) {
      const check = toCheck(existing[0] as unknown as Record<string, unknown>)
      // Only a running check needs to know about newer events; a waiting one will see them anyway.
      if (check.claimed_at || (forced && !check.forced)) {
        await this.updateBackInStockPendingChecks({
          id: check.id,
          ...(check.claimed_at ? { dirty_at: now } : {}),
          ...(forced ? { forced: true } : {}),
        })
      }
      return { check, created: false }
    }
    try {
      const created = await this.createBackInStockPendingChecks({ ...pair, due_at: dueAt, forced })
      return { check: toCheck(created as unknown as Record<string, unknown>), created: true }
    } catch (error) {
      // Two events for a new pair raced; the unique index let one through.
      const raced = await this.listBackInStockPendingChecks(pair, { take: 1 })
      if (!raced[0]) {
        throw error
      }
      return { check: toCheck(raced[0] as unknown as Record<string, unknown>), created: false }
    }
  }

  /**
   * Re-emits checks whose timer may be lost: unclaimed rows (with the delay
   * that is left) and rows whose claim is stale. Called at startup and by the
   * daily cleanup job.
   */
  async resumePendingChecks(now = new Date()): Promise<number> {
    if (!(await this.isEnabled())) {
      return 0
    }
    // MedusaService keeps the event bus of the module's container here (not part of its public type).
    const eventBus = (this as unknown as { eventBusModuleService_?: IEventBusModuleService }).eventBusModuleService_
    if (!eventBus) {
      return 0
    }
    const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS)
    const rows = (await this.listBackInStockPendingChecks(
      { $or: [{ claimed_at: null }, { claimed_at: { $lt: staleBefore } }] },
      { take: null }
    )) as unknown as Array<Record<string, unknown>>
    for (const row of rows.map(toCheck)) {
      const delay = row.claimed_at ? 0 : Math.max(0, row.due_at.getTime() - now.getTime())
      await eventBus.emit({ name: BackInStockEvents.CHECK_DUE, data: { id: row.id } }, { delay })
    }
    return rows.length
  }

  /* Stock state ------------------------------------------------------------- */

  async getState(pair: Pair): Promise<VariantStateRecord | null> {
    const [row] = await this.listBackInStockVariantStates(pair, { take: 1 })
    return (row as unknown as VariantStateRecord) ?? null
  }

  async saveState(state: VariantStateRecord): Promise<void> {
    const [row] = await this.listBackInStockVariantStates(
      { variant_id: state.variant_id, sales_channel_id: state.sales_channel_id },
      { take: 1, select: ["id"] }
    )
    if (row) {
      await this.updateBackInStockVariantStates({ id: row.id, ...state, reason: state.reason ?? null })
      return
    }
    try {
      await this.createBackInStockVariantStates({ ...state, reason: state.reason ?? null })
    } catch {
      // Created concurrently; the next check updates it.
    }
  }

  /* Subscriptions ----------------------------------------------------------- */

  async listNotifiable(
    pair: Pair,
    rules: { notifiedBefore: Date | null; max: number; demoOnly: boolean }
  ): Promise<SubscriptionRecord[]> {
    const filters: Record<string, unknown> = {
      ...pair,
      status: "active",
      notification_count: { $lt: rules.max },
      email: { $ne: null },
    }
    if (rules.demoOnly) {
      filters.demo = true
    }
    if (rules.notifiedBefore) {
      filters.$or = [{ last_notified_at: null }, { last_notified_at: { $lt: rules.notifiedBefore } }]
    }
    return (await this.listBackInStockSubscriptions(filters, {
      take: null,
      order: { created_at: "ASC" },
    })) as unknown as SubscriptionRecord[]
  }

  async claimNotification(
    subscription: SubscriptionRecord,
    kind: "restock" | "confirm",
    available: number | null
  ): Promise<string | null> {
    try {
      const created = await this.createBackInStockNotifications({
        subscription_id: subscription.id,
        variant_id: subscription.variant_id,
        sales_channel_id: subscription.sales_channel_id,
        kind,
        status: "pending",
        available,
      })
      return created.id
    } catch (error) {
      // The unique index allows one pending email per subscription: that is
      // "someone else is sending". Any other failure is not, and is thrown.
      const [pending] = await this.listBackInStockNotifications(
        { subscription_id: subscription.id, status: "pending" },
        { take: 1, select: ["id"] }
      )
      if (pending) {
        return null
      }
      throw error
    }
  }

  async completeNotification(
    id: string,
    subscription: SubscriptionRecord,
    result: DeliveryResult,
    now: Date
  ): Promise<void> {
    const delivered = result.status === "sent" || result.status === "demo"
    await this.updateBackInStockNotifications({
      id,
      status: result.status,
      via: result.via,
      error: result.error ?? null,
      sent_at: delivered ? now : null,
    })
    if (!delivered) {
      return
    }
    // Confirmation emails do not count toward the notification limit.
    const [row] = await this.listBackInStockNotifications({ id }, { take: 1, select: ["id", "kind"] })
    if (row?.kind !== "restock") {
      return
    }
    // Read the count fresh: the subscription passed in may be older than this send.
    const [current] = (await this.listBackInStockSubscriptions(
      { id: subscription.id },
      { take: 1, select: ["id", "notification_count"] }
    )) as Array<{ id: string; notification_count: number }>
    await this.updateBackInStockSubscriptions({
      id: subscription.id,
      notification_count: (current?.notification_count ?? subscription.notification_count) + 1,
      last_notified_at: now,
    })
  }

  async issueToken(subscriptionId: string, purpose: TokenPurpose): Promise<string> {
    const { token, hash } = createToken()
    await this.createBackInStockTokens({ subscription_id: subscriptionId, purpose, token_hash: hash })
    return token
  }

  /** The open subscription a token belongs to, or the ended one (to show "already done"). */
  async findByToken(
    token: string,
    purpose: TokenPurpose
  ): Promise<{ subscription: SubscriptionRecord; token_id: string; used: boolean } | null> {
    const [row] = await this.listBackInStockTokens({ token_hash: hashToken(token), purpose }, { take: 1 })
    if (!row) {
      return null
    }
    const [subscription] = await this.listBackInStockSubscriptions({ id: row.subscription_id }, { take: 1 })
    if (!subscription || (subscription as unknown as SubscriptionRecord).anonymized_at) {
      return null
    }
    return {
      subscription: subscription as unknown as SubscriptionRecord,
      token_id: row.id,
      used: Boolean(row.used_at),
    }
  }

  /** Ends open subscriptions for variants a customer bought (matched by customer or email). */
  async endForPurchase(
    variantIds: string[],
    match: { customer_id?: string | null; email?: string | null },
    now = new Date()
  ) {
    const who = [
      ...(match.customer_id ? [{ customer_id: match.customer_id }] : []),
      ...(match.email ? [{ email: match.email.trim().toLowerCase() }] : []),
    ]
    if (!variantIds.length || !who.length) {
      return 0
    }
    const open = (await this.listBackInStockSubscriptions(
      { variant_id: variantIds, status: OPEN_STATUSES, $or: who },
      { take: null, select: ["id"] }
    )) as Array<{ id: string }>
    if (open.length) {
      await this.updateBackInStockSubscriptions(
        open.map((subscription) => ({ id: subscription.id, status: "purchased" as const, ended_at: now }))
      )
    }
    return open.length
  }

  /* Admin ------------------------------------------------------------------- */

  /**
   * Variants ranked by people waiting (active subscriptions), with pending
   * and ended counts. Grouped in SQL so it stays fast with many subscriptions.
   */
  @InjectManager()
  async rankWanted(
    filter: { limit: number; offset: number; demo?: boolean; productIds?: string[] },
    @MedusaContext() context: Context = {}
  ): Promise<{
    rows: Array<{ variant_id: string; sales_channel_id: string; waiting: number; pending: number; notified: number }>
    count: number
  }> {
    // A read: the shared manager is enough, no transaction needed.
    const manager = context.manager as unknown as SqlManager
    const demo = filter.demo === undefined ? "" : ` and "demo" = ${filter.demo ? "true" : "false"}`
    const products = filter.productIds?.length
      ? ` and "product_id" in (${filter.productIds.map(() => "?").join(", ")})`
      : ""
    const params = filter.productIds ?? []
    const base =
      `from "back_in_stock_subscription" where "deleted_at" is null and "status" in ('pending', 'active')${demo}${products} ` +
      `group by "variant_id", "sales_channel_id"`
    const rows = await manager.execute(
      `select "variant_id", "sales_channel_id", ` +
        `count(*) filter (where "status" = 'active') as "waiting", ` +
        `count(*) filter (where "status" = 'pending') as "pending", ` +
        `coalesce(sum("notification_count"), 0) as "notified" ` +
        `${base} order by "waiting" desc, "pending" desc, "variant_id" limit ? offset ?`,
      [...params, filter.limit, filter.offset]
    )
    const [total] = await manager.execute(`select count(*) as "count" from (select 1 ${base}) as "groups"`, params)
    return {
      rows: rows.map((row) => ({
        variant_id: String(row.variant_id),
        sales_channel_id: String(row.sales_channel_id),
        waiting: Number(row.waiting),
        pending: Number(row.pending),
        notified: Number(row.notified),
      })),
      count: Number(total?.count ?? 0),
    }
  }

  /* Retention --------------------------------------------------------------- */

  /**
   * - deletes unconfirmed subscriptions after `unconfirmedDays`
   * - expires active subscriptions after `activeDays`
   * - removes the email, customer and tokens of subscriptions ended more than
   *   `endedDays` ago; the row stays for the statistics
   * - counts emails left "pending" by a crash as sent (one may have gone out)
   */
  async applyRetention(settings: EffectiveSettings, now = new Date()) {
    const day = 86_400_000
    const before = (days: number) => new Date(now.getTime() - days * day)

    const unconfirmed = (await this.listBackInStockSubscriptions(
      { status: "pending", created_at: { $lt: before(settings.retention.unconfirmedDays) } },
      { take: null, select: ["id"] }
    )) as Array<{ id: string }>
    await this.deleteSubscriptionsAndTokens(unconfirmed.map((row) => row.id))

    const expired = (await this.listBackInStockSubscriptions(
      { status: "active", created_at: { $lt: before(settings.retention.activeDays) } },
      { take: null, select: ["id"] }
    )) as Array<{ id: string }>
    if (expired.length) {
      await this.updateBackInStockSubscriptions(
        expired.map((row) => ({ id: row.id, status: "expired" as const, ended_at: now }))
      )
    }

    const ended = (await this.listBackInStockSubscriptions(
      { status: ENDED_STATUSES, anonymized_at: null, ended_at: { $lt: before(settings.retention.endedDays) } },
      { take: null, select: ["id"] }
    )) as Array<{ id: string }>
    if (ended.length) {
      await this.updateBackInStockSubscriptions(
        ended.map((row) => ({ id: row.id, email: null, customer_id: null, anonymized_at: now }))
      )
      await this.deleteTokensOf(ended.map((row) => row.id))
    }

    const stuck = (await this.listBackInStockNotifications(
      { status: "pending", created_at: { $lt: new Date(now.getTime() - 60 * 60_000) } },
      { take: null }
    )) as Array<{ id: string; subscription_id: string; kind: string; created_at: Date }>
    for (const row of stuck) {
      await this.updateBackInStockNotifications({
        id: row.id,
        status: "sent",
        error: "The worker stopped while sending; counted as sent so it is not repeated.",
        sent_at: row.created_at,
      })
      if (row.kind === "restock") {
        const [subscription] = (await this.listBackInStockSubscriptions(
          { id: row.subscription_id },
          { take: 1, select: ["id", "notification_count"] }
        )) as Array<{ id: string; notification_count: number }>
        if (subscription) {
          await this.updateBackInStockSubscriptions({
            id: subscription.id,
            notification_count: subscription.notification_count + 1,
            last_notified_at: row.created_at,
          })
        }
      }
    }

    return { deleted: unconfirmed.length, expired: expired.length, anonymized: ended.length, recovered: stuck.length }
  }

  /** Deletes subscriptions with their tokens and history (unconfirmed or demo data). */
  async deleteSubscriptionsAndTokens(ids: string[]): Promise<void> {
    if (!ids.length) {
      return
    }
    await this.deleteTokensOf(ids)
    const notifications = (await this.listBackInStockNotifications(
      { subscription_id: ids },
      { take: null, select: ["id"] }
    )) as Array<{ id: string }>
    if (notifications.length) {
      await this.deleteBackInStockNotifications(notifications.map((row) => row.id))
    }
    await this.deleteBackInStockSubscriptions(ids)
  }

  private async deleteTokensOf(subscriptionIds: string[]): Promise<void> {
    const tokens = (await this.listBackInStockTokens(
      { subscription_id: subscriptionIds },
      { take: null, select: ["id"] }
    )) as Array<{ id: string }>
    if (tokens.length) {
      await this.deleteBackInStockTokens(tokens.map((row) => row.id))
    }
  }
}
