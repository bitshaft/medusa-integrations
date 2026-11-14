import type { Context, Logger } from "@medusajs/framework/types"
import {
  generateEntityId,
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils"

import { logPluginDisabled, pluginDisabledError } from "../../lib/loyalty/kit/options"
import { LoyaltyError } from "../../lib/loyalty/messages"
import { type LoyaltyPluginOptions, parseOptions, PLUGIN_NAME } from "../../lib/loyalty/options"
import { type LoyaltySettings, readSettings, settingsSchema } from "../../lib/loyalty/settings"
import type { ActorType, EntryReason, EntryType, RedemptionStatus, RewardKind } from "../../lib/loyalty/types"
import {
  LoyaltyAccount,
  LoyaltyEntry,
  LoyaltyRedemption,
  LoyaltyReward,
  LoyaltySetting,
  LoyaltyTierChange,
} from "./models"

type InjectedDependencies = { logger: Logger }
type SqlManager = { execute(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }

export const SETTINGS_KEY = "settings"

export type EntryInput = {
  /** Idempotency key: an entry with the same key is never written twice. */
  key: string
  type: EntryType
  reason: EntryReason
  points: number
  order_id?: string | null
  reward_id?: string | null
  redemption_id?: string | null
  code?: string | null
  description?: string | null
  actor_type?: ActorType
  actor_id?: string | null
  metadata?: Record<string, unknown> | null
}

export type EntryRecord = Required<Omit<EntryInput, "metadata">> & {
  id: string
  account_id: string
  customer_id: string
  metadata: Record<string, unknown> | null
  created_at: Date
}

export type AccountRecord = {
  id: string
  customer_id: string
  tier_id: string | null
  balance: number
  last_activity_at: Date | null
  birthday: string | null
  birthday_set_at: Date | null
  reminded_for: string | null
  created_at: Date
}

export type RedemptionRecord = {
  id: string
  reward_id: string
  reward_name: string
  customer_id: string
  kind: RewardKind
  cost: number
  status: RedemptionStatus
  code: string | null
  promotion_id: string | null
  expires_at: Date | null
  cart_id: string | null
  variant_id: string | null
  order_id: string | null
  created_at: Date
}

export type ReturnNote = {
  description: string
  actor_type?: ActorType
  actor_id?: string | null
  /** false: close the redemption without giving points back. */
  refund?: boolean
  /** Statuses it may leave: issued codes and gifts in a cart by default. */
  from?: RedemptionStatus[]
}

/** `changed` is true only for the call that actually closed the redemption, so callers emit events once. */
export type ReturnResult = { redemption: RedemptionRecord | null; changed: boolean }

export type PostResult = { account: AccountRecord; balance: number; created: EntryRecord[]; skipped: string[] }

const date = (value: unknown): Date | null => (value == null ? null : new Date(value as string))

const toAccount = (row: Record<string, unknown>): AccountRecord => ({
  id: String(row.id),
  customer_id: String(row.customer_id),
  tier_id: (row.tier_id as string) ?? null,
  balance: Number(row.balance ?? 0),
  last_activity_at: date(row.last_activity_at),
  birthday: (row.birthday as string) ?? null,
  birthday_set_at: date(row.birthday_set_at),
  reminded_for: (row.reminded_for as string) ?? null,
  created_at: new Date(row.created_at as string),
})

const toEntry = (row: Record<string, unknown>): EntryRecord => ({
  id: String(row.id),
  account_id: String(row.account_id),
  customer_id: String(row.customer_id),
  key: String(row.key),
  type: row.type as EntryType,
  reason: row.reason as EntryReason,
  points: Number(row.points),
  order_id: (row.order_id as string) ?? null,
  reward_id: (row.reward_id as string) ?? null,
  redemption_id: (row.redemption_id as string) ?? null,
  code: (row.code as string) ?? null,
  description: (row.description as string) ?? null,
  actor_type: row.actor_type as ActorType,
  actor_id: (row.actor_id as string) ?? null,
  metadata: (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) ?? null,
  created_at: new Date(row.created_at as string),
})

export const toRedemption = (row: Record<string, unknown>): RedemptionRecord => ({
  id: String(row.id),
  reward_id: String(row.reward_id),
  reward_name: String(row.reward_name),
  customer_id: String(row.customer_id),
  kind: row.kind as RewardKind,
  cost: Number(row.cost),
  status: row.status as RedemptionStatus,
  code: (row.code as string) ?? null,
  promotion_id: (row.promotion_id as string) ?? null,
  expires_at: date(row.expires_at),
  cart_id: (row.cart_id as string) ?? null,
  variant_id: (row.variant_id as string) ?? null,
  order_id: (row.order_id as string) ?? null,
  created_at: new Date(row.created_at as string),
})

/** The open transaction of one account: its locked row and current balance. */
type Tx = { manager: SqlManager; account: AccountRecord; balance: number }

/**
 * The loyalty module: accounts, the immutable points ledger, rewards,
 * redemptions, tier history and the settings the owner edits.
 *
 * Every balance change goes through `withAccount_`: one transaction that
 * locks the account row (`FOR UPDATE`), reads the balance from the ledger
 * sum, checks the rules and appends entries with `ON CONFLICT DO NOTHING`
 * on their key. Two redemptions at once run one after the other, and a
 * repeated event writes nothing.
 */
export default class LoyaltyModuleService extends MedusaService({
  LoyaltyAccount,
  LoyaltyEntry,
  LoyaltyReward,
  LoyaltyRedemption,
  LoyaltyTierChange,
  LoyaltySetting,
}) {
  protected readonly state_: { options: LoyaltyPluginOptions } | { disabled: string }

  constructor(container: InjectedDependencies, options: Record<string, unknown>) {
    super(...arguments)
    const parsed = parseOptions(options)
    if (!parsed.enabled) {
      logPluginDisabled(container.logger, PLUGIN_NAME, parsed.reason)
      this.state_ = { disabled: parsed.reason }
      return
    }
    this.state_ = { options: parsed.options }
  }

  async isEnabled(): Promise<boolean> {
    return !("disabled" in this.state_)
  }

  async disabledReason(): Promise<string | null> {
    return "disabled" in this.state_ ? this.state_.disabled : null
  }

  async getOptions(): Promise<LoyaltyPluginOptions> {
    if ("disabled" in this.state_) throw pluginDisabledError(PLUGIN_NAME, this.state_.disabled)
    return this.state_.options
  }

  /* Settings -------------------------------------------------------------- */

  async getSettings(): Promise<LoyaltySettings> {
    const [row] = await this.listLoyaltySettings({ key: SETTINGS_KEY })
    return readSettings(row?.value)
  }

  /** Replaces the settings (validated); the owner always saves the whole form. */
  async saveSettings(value: unknown): Promise<LoyaltySettings> {
    const settings = settingsSchema.parse(value)
    const [row] = await this.listLoyaltySettings({ key: SETTINGS_KEY })
    // A JSON column update merges objects, so replace the row instead.
    if (row) await this.deleteLoyaltySettings(row.id)
    await this.createLoyaltySettings({ key: SETTINGS_KEY, value: settings as unknown as Record<string, unknown> })
    return settings
  }

  /* Reading --------------------------------------------------------------- */

  @InjectManager()
  async getAccount(customerId: string, @MedusaContext() context: Context = {}): Promise<AccountRecord | null> {
    const manager = context.manager as unknown as SqlManager
    const [row] = await manager.execute(
      `select * from "loyalty_account" where "customer_id" = ? and "deleted_at" is null`,
      [customerId]
    )
    return row ? toAccount(row) : null
  }

  /** The balance as the sum of the ledger. */
  @InjectManager()
  async balanceOf(customerId: string, @MedusaContext() context: Context = {}): Promise<number> {
    const manager = context.manager as unknown as SqlManager
    const [row] = await manager.execute(
      `select coalesce(sum("points"), 0) as "sum" from "loyalty_entry" where "customer_id" = ? and "deleted_at" is null`,
      [customerId]
    )
    return Number(row?.sum ?? 0)
  }

  @InjectManager()
  async entriesByKey(keys: string[], @MedusaContext() context: Context = {}): Promise<EntryRecord[]> {
    if (!keys.length) return []
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select * from "loyalty_entry" where "key" in (${keys.map(() => "?").join(", ")}) and "deleted_at" is null`,
      keys
    )
    return rows.map(toEntry)
  }

  /* Statistics ------------------------------------------------------------ */

  /** Points per reason since a date. */
  @InjectManager()
  async ledgerTotals(since: Date, @MedusaContext() context: Context = {}): Promise<Record<string, number>> {
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select "reason", coalesce(sum("points"), 0) as "sum" from "loyalty_entry" where "created_at" >= ? and "deleted_at" is null group by "reason"`,
      [since]
    )
    return Object.fromEntries(rows.map((r) => [String(r.reason), Number(r.sum)]))
  }

  /** Accounts per tier id ("" for no tier) and the sum of positive balances. */
  @InjectManager()
  async accountTotals(
    @MedusaContext() context: Context = {}
  ): Promise<{ tiers: Record<string, number>; open_points: number; accounts: number }> {
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select coalesce("tier_id", '') as "tier", count(*) as "count", coalesce(sum(greatest("balance", 0)), 0) as "open" ` +
        `from "loyalty_account" where "deleted_at" is null group by coalesce("tier_id", '')`
    )
    return {
      tiers: Object.fromEntries(rows.map((r) => [String(r.tier), Number(r.count)])),
      open_points: rows.reduce((sum, r) => sum + Number(r.open), 0),
      accounts: rows.reduce((sum, r) => sum + Number(r.count), 0),
    }
  }

  /** Redemptions per reward, released ones not counted. */
  @InjectManager()
  async rewardTotals(@MedusaContext() context: Context = {}): Promise<Record<string, number>> {
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select "reward_id", count(*) as "count" from "loyalty_redemption" where "status" <> 'released' and "deleted_at" is null group by "reward_id"`
    )
    return Object.fromEntries(rows.map((r) => [String(r.reward_id), Number(r.count)]))
  }

  /* Writing: every balance change ----------------------------------------- */

  /**
   * Appends entries for one customer. Entries whose key exists are skipped.
   * `activity` moves the expiry clock (orders and redemptions do).
   */
  @InjectManager()
  async post(
    customerId: string,
    entries: EntryInput[],
    options: { activity?: Date | null } = {},
    @MedusaContext() context: Context = {}
  ): Promise<PostResult> {
    return this.post_(customerId, entries, options, context)
  }

  @InjectTransactionManager()
  protected async post_(
    customerId: string,
    entries: EntryInput[],
    options: { activity?: Date | null },
    @MedusaContext() context: Context = {}
  ): Promise<PostResult> {
    const tx = await this.lock_(customerId, context)
    return this.append_(tx, entries, options.activity ?? null)
  }

  /**
   * Spends points on a reward and records the redemption, atomically: the
   * balance must cover the cost and must not be negative, the per-customer
   * limit is counted under the same lock.
   */
  @InjectManager()
  async redeem(
    input: {
      customer_id: string
      reward: { id: string; name: string; kind: RewardKind; cost: number; per_customer_limit: number | null }
      status: RedemptionStatus
      cart_id?: string | null
      variant_id?: string | null
      now: Date
      actor_type?: ActorType
    },
    @MedusaContext() context: Context = {}
  ): Promise<{ redemption: RedemptionRecord; balance: number }> {
    return this.redeem_(input, context)
  }

  @InjectTransactionManager()
  protected async redeem_(
    input: Parameters<LoyaltyModuleService["redeem"]>[0],
    @MedusaContext() context: Context = {}
  ): Promise<{ redemption: RedemptionRecord; balance: number }> {
    const tx = await this.lock_(input.customer_id, context)
    if (tx.balance < 0) throw new LoyaltyError("negative_balance")
    if (tx.balance < input.reward.cost) {
      throw new LoyaltyError("insufficient_points", { cost: input.reward.cost, balance: tx.balance })
    }
    if (input.reward.per_customer_limit != null) {
      const [row] = await tx.manager.execute(
        `select count(*) as "count" from "loyalty_redemption" ` +
          `where "customer_id" = ? and "reward_id" = ? and "status" not in ('released') and "deleted_at" is null`,
        [input.customer_id, input.reward.id]
      )
      if (Number(row?.count ?? 0) >= input.reward.per_customer_limit) throw new LoyaltyError("limit_reached")
    }
    const id = generateEntityId(undefined, "lred")
    const [row] = await tx.manager.execute(
      `insert into "loyalty_redemption" ("id", "reward_id", "reward_name", "customer_id", "kind", "cost", "status", "cart_id", "variant_id", "created_at", "updated_at") ` +
        `values (?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now()) returning *`,
      [
        id,
        input.reward.id,
        input.reward.name,
        input.customer_id,
        input.reward.kind,
        input.reward.cost,
        input.status,
        input.cart_id ?? null,
        input.variant_id ?? null,
      ]
    )
    const result = await this.append_(
      tx,
      [
        {
          key: `redeem:${id}`,
          type: "redemption",
          reason: "redeem",
          points: -input.reward.cost,
          reward_id: input.reward.id,
          redemption_id: id,
          description: input.reward.name,
          actor_type: input.actor_type ?? "customer",
          actor_id: input.customer_id,
        },
      ],
      input.now
    )
    return { redemption: toRedemption(row), balance: result.balance }
  }

  /**
   * Gives back the points of a redemption once (gift removed, cart
   * abandoned, code expired unused, or the redemption failed) and moves it
   * to `status`. Does nothing for a redemption already final.
   */
  @InjectManager()
  async returnRedemption(
    redemptionId: string,
    status: "released" | "expired",
    note: ReturnNote,
    @MedusaContext() context: Context = {}
  ): Promise<ReturnResult> {
    return this.returnRedemption_(redemptionId, status, note, context)
  }

  @InjectTransactionManager()
  protected async returnRedemption_(
    redemptionId: string,
    status: "released" | "expired",
    note: ReturnNote,
    @MedusaContext() context: Context = {}
  ): Promise<ReturnResult> {
    const manager = context.transactionManager as unknown as SqlManager
    const [found] = await manager.execute(
      `select * from "loyalty_redemption" where "id" = ? and "deleted_at" is null`,
      [redemptionId]
    )
    if (!found) return { redemption: null, changed: false }
    const tx = await this.lock_(String(found.customer_id), context)
    // Re-read under the account lock: another worker may have finished it.
    const [current] = await tx.manager.execute(`select * from "loyalty_redemption" where "id" = ? for update`, [
      redemptionId,
    ])
    if (!(note.from ?? ["issued", "in_cart"]).includes(current.status as RedemptionStatus)) {
      return { redemption: toRedemption(current), changed: false }
    }
    const [row] = await tx.manager.execute(
      `update "loyalty_redemption" set "status" = ?, "updated_at" = now() where "id" = ? returning *`,
      [status, redemptionId]
    )
    if (note.refund !== false) {
      await this.append_(
        tx,
        [
          {
            key: `redeem_returned:${redemptionId}`,
            type: "redemption",
            reason: "redeem_returned",
            points: Number(current.cost),
            reward_id: String(current.reward_id),
            redemption_id: redemptionId,
            code: (current.code as string) ?? null,
            description: note.description,
            actor_type: note.actor_type ?? "system",
            actor_id: note.actor_id ?? null,
          },
        ],
        null
      )
    }
    return { redemption: toRedemption(row), changed: true }
  }

  /**
   * Takes back points of an order up to `target` in total (returns and
   * cancellation share one pool), writing only the difference. Safe to call
   * again with the same or a lower target.
   */
  @InjectManager()
  async revertOrder(
    customerId: string,
    orderId: string,
    target: number | "all",
    reason: "return" | "cancel",
    metadata: Record<string, unknown> = {},
    @MedusaContext() context: Context = {}
  ): Promise<{ reverted: number; balance: number }> {
    return this.revertOrder_(customerId, orderId, target, reason, metadata, context)
  }

  @InjectTransactionManager()
  protected async revertOrder_(
    customerId: string,
    orderId: string,
    target: number | "all",
    reason: "return" | "cancel",
    metadata: Record<string, unknown>,
    @MedusaContext() context: Context = {}
  ): Promise<{ reverted: number; balance: number }> {
    const tx = await this.lock_(customerId, context)
    const [sums] = await tx.manager.execute(
      `select coalesce(sum(case when "points" > 0 then "points" else 0 end), 0) as "earned", ` +
        `coalesce(-sum(case when "reason" in ('return', 'cancel') then "points" else 0 end), 0) as "reverted" ` +
        `from "loyalty_entry" where "customer_id" = ? and "order_id" = ? and "reason" in ('earn', 'first_order', 'return', 'cancel') and "deleted_at" is null`,
      [customerId, orderId]
    )
    const earned = Number(sums.earned)
    const already = Number(sums.reverted)
    const wanted = Math.min(earned, target === "all" ? earned : target)
    const diff = wanted - already
    if (diff <= 0) return { reverted: 0, balance: tx.balance }
    const result = await this.append_(
      tx,
      [
        {
          key: `order:${orderId}:${reason}:${wanted}`,
          type: reason === "cancel" ? "order" : "return",
          reason,
          points: -diff,
          order_id: orderId,
          metadata,
        },
      ],
      null
    )
    return { reverted: result.created.length ? diff : 0, balance: result.balance }
  }

  /**
   * Expires the whole positive balance with one "expiry" entry, computed
   * under the lock so points arriving at the same moment are not lost.
   * `key` names the inactivity period, so it expires once.
   */
  @InjectManager()
  async expireBalance(
    customerId: string,
    key: string,
    description: string,
    @MedusaContext() context: Context = {}
  ): Promise<{ expired: number; balance: number }> {
    return this.expireBalance_(customerId, key, description, context)
  }

  @InjectTransactionManager()
  protected async expireBalance_(
    customerId: string,
    key: string,
    description: string,
    @MedusaContext() context: Context = {}
  ): Promise<{ expired: number; balance: number }> {
    const tx = await this.lock_(customerId, context)
    if (tx.balance <= 0) return { expired: 0, balance: tx.balance }
    const amount = tx.balance
    const result = await this.append_(
      tx,
      [{ key, type: "expiry", reason: "expired", points: -amount, description }],
      null
    )
    return { expired: result.created.length ? amount : 0, balance: result.balance }
  }

  /**
   * Sets the tier under the account lock and says whether this call changed
   * it, so two orders paid at once record (and announce) one change.
   */
  @InjectManager()
  async swapTier(
    customerId: string,
    tierId: string | null,
    @MedusaContext() context: Context = {}
  ): Promise<{ from: string | null; changed: boolean }> {
    return this.swapTier_(customerId, tierId, context)
  }

  @InjectTransactionManager()
  protected async swapTier_(
    customerId: string,
    tierId: string | null,
    @MedusaContext() context: Context = {}
  ): Promise<{ from: string | null; changed: boolean }> {
    const tx = await this.lock_(customerId, context)
    const from = tx.account.tier_id
    if (from === tierId) return { from, changed: false }
    await tx.manager.execute(`update "loyalty_account" set "tier_id" = ?, "updated_at" = now() where "id" = ?`, [
      tierId,
      tx.account.id,
    ])
    return { from, changed: true }
  }

  /** Changes account fields (tier, birthday, reminder) under the account lock. */
  @InjectManager()
  async updateAccount(
    customerId: string,
    patch: Partial<Pick<AccountRecord, "tier_id" | "birthday" | "birthday_set_at" | "reminded_for">>,
    @MedusaContext() context: Context = {}
  ): Promise<AccountRecord> {
    return this.updateAccount_(customerId, patch, context)
  }

  @InjectTransactionManager()
  protected async updateAccount_(
    customerId: string,
    patch: Partial<Pick<AccountRecord, "tier_id" | "birthday" | "birthday_set_at" | "reminded_for">>,
    @MedusaContext() context: Context = {}
  ): Promise<AccountRecord> {
    const tx = await this.lock_(customerId, context)
    const keys = Object.keys(patch) as Array<keyof typeof patch>
    if (!keys.length) return tx.account
    const [row] = await tx.manager.execute(
      `update "loyalty_account" set ${keys.map((k) => `"${k}" = ?`).join(", ")}, "updated_at" = now() where "id" = ? returning *`,
      [...keys.map((k) => patch[k] ?? null), tx.account.id]
    )
    return toAccount(row)
  }

  /* Internals ------------------------------------------------------------- */

  /** Creates the account if needed, locks it and reads the ledger balance. */
  @InjectTransactionManager()
  protected async lock_(customerId: string, @MedusaContext() context: Context = {}): Promise<Tx> {
    const manager = context.transactionManager as unknown as SqlManager
    await manager.execute(
      `insert into "loyalty_account" ("id", "customer_id", "balance", "created_at", "updated_at") values (?, ?, 0, now(), now()) ` +
        `on conflict ("customer_id") where "deleted_at" is null do nothing`,
      [generateEntityId(undefined, "lacc"), customerId]
    )
    const [row] = await manager.execute(
      `select * from "loyalty_account" where "customer_id" = ? and "deleted_at" is null for update`,
      [customerId]
    )
    const [sum] = await manager.execute(
      `select coalesce(sum("points"), 0) as "sum" from "loyalty_entry" where "account_id" = ? and "deleted_at" is null`,
      [row.id]
    )
    return { manager, account: toAccount(row), balance: Number(sum.sum) }
  }

  protected async append_(tx: Tx, entries: EntryInput[], activity: Date | null): Promise<PostResult> {
    const created: EntryRecord[] = []
    const skipped: string[] = []
    for (const entry of entries) {
      if (!Number.isInteger(entry.points)) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, `[loyalty] Points must be whole numbers (${entry.key}).`)
      }
      const rows = await tx.manager.execute(
        `insert into "loyalty_entry" ("id", "account_id", "customer_id", "type", "reason", "points", "key", "order_id", "reward_id", "redemption_id", "code", "description", "actor_type", "actor_id", "metadata", "created_at", "updated_at") ` +
          `values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now()) ` +
          `on conflict ("key") where "deleted_at" is null do nothing returning *`,
        [
          generateEntityId(undefined, "lent"),
          tx.account.id,
          tx.account.customer_id,
          entry.type,
          entry.reason,
          entry.points,
          entry.key,
          entry.order_id ?? null,
          entry.reward_id ?? null,
          entry.redemption_id ?? null,
          entry.code ?? null,
          entry.description ?? null,
          entry.actor_type ?? "system",
          entry.actor_id ?? null,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
        ]
      )
      if (rows[0]) created.push(toEntry(rows[0]))
      else skipped.push(entry.key)
    }
    const balance = tx.balance + created.reduce((sum, e) => sum + e.points, 0)
    const touched = activity && created.length > 0
    const [row] = await tx.manager.execute(
      `update "loyalty_account" set "balance" = ?, ` +
        (touched ? `"last_activity_at" = greatest(coalesce("last_activity_at", ?), ?), "reminded_for" = null, ` : "") +
        `"updated_at" = now() where "id" = ? returning *`,
      touched ? [balance, activity, activity, tx.account.id] : [balance, tx.account.id]
    )
    tx.balance = balance
    tx.account = toAccount(row)
    return { account: tx.account, balance, created, skipped }
  }
}
