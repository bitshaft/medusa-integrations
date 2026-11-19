import type { Context, Logger } from "@medusajs/framework/types"
import {
  generateEntityId,
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"

import { logPluginDisabled } from "../../lib/negotiations/kit/options"
import { NegotiationError } from "../../lib/negotiations/messages"
import {
  DEFAULT_OPTIONS,
  type NegotiationsPluginOptions,
  parseOptions,
  PLUGIN_NAME,
} from "../../lib/negotiations/options"
import { type NegotiationsSettings, readSettings, settingsSchema } from "../../lib/negotiations/settings"
import { MOVES, type Move } from "../../lib/negotiations/state"
import type { Actor, Author, MessageType, Offer, Status } from "../../lib/negotiations/types"
import type { MessageRecord, ThreadRecord } from "../../lib/negotiations/views"
import {
  NegotiationCounter,
  NegotiationMessage,
  NegotiationSetting,
  NegotiationThread,
  NegotiationVariantFloor,
  NegotiationWrite,
  NegotiationWriteRun,
} from "./models"

type InjectedDependencies = { logger: Logger }
type Row = Record<string, any>
type SqlManager = { execute(sql: string, params?: unknown[]): Promise<Row[]> }

const SETTINGS_KEY = "settings"

/** `in (?, ?, …)` with one placeholder per value (the driver does not expand arrays). */
const inList = (values: unknown[]) => `(${values.map(() => "?").join(", ")})`

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const date = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)))
const dateOrNull = (v: unknown): Date | null => (v === null || v === undefined ? null : date(v))
const json = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T

export function toThread(row: Row): ThreadRecord {
  return {
    id: row.id,
    number: row.number,
    is_demo: Boolean(row.is_demo),
    customer_id: row.customer_id,
    customer: json(row.customer),
    kind: row.kind,
    lines: json(row.lines),
    currency_code: row.currency_code,
    tax_inclusive: Boolean(row.tax_inclusive),
    region_id: row.region_id ?? null,
    source_cart_id: row.source_cart_id ?? null,
    product_id: row.product_id ?? null,
    variant_id: row.variant_id ?? null,
    quantity_total: num(row.quantity_total),
    catalog_total: num(row.catalog_total),
    target: json(row.target),
    target_total: num(row.target_total),
    offer: row.offer ? json(row.offer) : null,
    offer_total: numOrNull(row.offer_total),
    offer_expires_at: dateOrNull(row.offer_expires_at),
    accepted: row.accepted ? json(row.accepted) : null,
    accepted_total: numOrNull(row.accepted_total),
    accepted_by: row.accepted_by ?? null,
    accepted_at: dateOrNull(row.accepted_at),
    accepted_until: dateOrNull(row.accepted_until),
    status: row.status,
    turn: row.turn ?? null,
    assignee_id: row.assignee_id ?? null,
    version: num(row.version),
    last_activity_at: date(row.last_activity_at),
    last_author: row.last_author,
    first_team_reply_at: dateOrNull(row.first_team_reply_at),
    closed_at: dateOrNull(row.closed_at),
    draft_order_id: row.draft_order_id ?? null,
    order_id: row.order_id ?? null,
    created_at: date(row.created_at),
    updated_at: date(row.updated_at),
  }
}

export function toMessage(row: Row): MessageRecord {
  return {
    id: row.id,
    thread_id: row.thread_id,
    author: row.author,
    author_id: row.author_id ?? null,
    type: row.type,
    body: row.body ?? null,
    price: row.price ? json(row.price) : null,
    price_total: numOrNull(row.price_total),
    internal: Boolean(row.internal),
    created_at: date(row.created_at),
  }
}

export type WriteRecord = {
  id: string
  thread_id: string
  kind: "draft_order" | "cart"
  status: "pending" | "done" | "failed" | "removed" | "ordered"
  target_id: string | null
  line_item_ids: string[] | null
  actor_id: string | null
  error: string | null
  created_at: Date
  updated_at: Date
}

const toWrite = (row: Row): WriteRecord => ({
  id: row.id,
  thread_id: row.thread_id,
  kind: row.kind,
  status: row.status,
  target_id: row.target_id ?? null,
  line_item_ids: row.line_item_ids ? json(row.line_item_ids) : null,
  actor_id: row.actor_id ?? null,
  error: row.error ?? null,
  created_at: date(row.created_at),
  updated_at: date(row.updated_at),
})

/** Columns a move may change, with how they are written. */
const JSON_COLUMNS = new Set(["offer", "accepted", "target", "lines", "customer"])
const PATCHABLE = new Set([
  "offer",
  "offer_total",
  "offer_expires_at",
  "accepted",
  "accepted_total",
  "accepted_by",
  "accepted_at",
  "accepted_until",
  "target",
  "target_total",
  "closed_at",
  "draft_order_id",
  "order_id",
])

export type NewMessage = {
  author: Author
  author_id: string | null
  type: MessageType
  body?: string | null
  price?: Offer | null
  internal?: boolean
}

export type MoveInput = {
  move: Move
  /** The version the caller saw. `null` only for system moves, which use the status alone. */
  version: number | null
  now: Date
  actor: Actor
  patch?: Partial<Record<string, unknown>>
  message: NewMessage
  /** Acceptance: the price the caller saw must still be the one on the table. */
  expectPrice?: { column: "offer_total" | "target_total"; value: number }
}

export type ThreadFilters = {
  is_demo: boolean
  status?: Status[]
  /** Only threads waiting for the team's move. */
  waiting?: boolean
  q?: string
  customer_id?: string
  product_id?: string
  /** A user id, or `null` for threads nobody leads. */
  assignee_id?: string | null
  limit?: number
  offset?: number
}

const ACTIVE_SQL = `('open', 'countered')`

/**
 * State and storage of negotiations. Every move is one conditional UPDATE
 * (`version` and `status` in the WHERE clause) plus its message, in one
 * transaction. Two people, or a person and the expiry job, cannot both
 * move the same version: the second update matches no row.
 */
class NegotiationsModuleService extends MedusaService({
  NegotiationThread,
  NegotiationMessage,
  NegotiationCounter,
  NegotiationVariantFloor,
  NegotiationSetting,
  NegotiationWrite,
  NegotiationWriteRun,
}) {
  protected state_: { options: NegotiationsPluginOptions } | { disabled: string }

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
    return "options" in this.state_
  }

  async disabledReason(): Promise<string | null> {
    return "disabled" in this.state_ ? this.state_.disabled : null
  }

  async getOptions(): Promise<NegotiationsPluginOptions> {
    return "options" in this.state_ ? this.state_.options : DEFAULT_OPTIONS
  }

  /* Settings ---------------------------------------------------------------- */

  @InjectManager()
  async getSettings(@MedusaContext() context: Context = {}): Promise<NegotiationsSettings> {
    const manager = context.manager as unknown as SqlManager
    const [row] = await manager.execute(
      `select "value" from "negotiation_setting" where "key" = ? and "deleted_at" is null`,
      [SETTINGS_KEY]
    )
    return readSettings(row ? json(row.value) : null)
  }

  @InjectManager()
  async saveSettings(value: unknown, @MedusaContext() context: Context = {}): Promise<NegotiationsSettings> {
    return await this.saveSettings_(value, context)
  }

  @InjectTransactionManager()
  protected async saveSettings_(value: unknown, @MedusaContext() context: Context = {}): Promise<NegotiationsSettings> {
    const settings = settingsSchema.parse(value)
    const manager = context.transactionManager as unknown as SqlManager
    await manager.execute(
      `insert into "negotiation_setting" ("id", "key", "value", "created_at", "updated_at") values (?, ?, ?::jsonb, now(), now()) ` +
        `on conflict ("key") where "deleted_at" is null do update set "value" = excluded."value", "updated_at" = now()`,
      [generateEntityId(undefined, "negs"), SETTINGS_KEY, JSON.stringify(settings)]
    )
    return settings
  }

  /* Threads ----------------------------------------------------------------- */

  /** NEG-2026-0001: one atomic upsert per number, so numbers never repeat. */
  @InjectManager()
  async nextNumber(year: number, @MedusaContext() context: Context = {}): Promise<string> {
    return await this.nextNumber_(year, context)
  }

  @InjectTransactionManager()
  protected async nextNumber_(year: number, @MedusaContext() context: Context = {}): Promise<string> {
    const manager = context.transactionManager as unknown as SqlManager
    const [row] = await manager.execute(
      `insert into "negotiation_counter" ("id", "year", "value", "created_at", "updated_at") values (?, ?, 1, now(), now()) ` +
        `on conflict ("year") where "deleted_at" is null do update set "value" = "negotiation_counter"."value" + 1, "updated_at" = now() returning "value"`,
      [generateEntityId(undefined, "negc"), year]
    )
    return `NEG-${year}-${String(num(row.value)).padStart(4, "0")}`
  }

  /** Inserts a thread with its first messages. */
  @InjectManager()
  async insertThread(
    thread: Omit<ThreadRecord, "id" | "created_at" | "updated_at" | "version"> & {
      id?: string
      search_text: string
      created_at?: Date
    },
    messages: Array<NewMessage & { created_at?: Date }>,
    @MedusaContext() context: Context = {}
  ): Promise<{ thread: ThreadRecord; messages: MessageRecord[] }> {
    return await this.insertThread_(thread, messages, context)
  }

  @InjectTransactionManager()
  protected async insertThread_(
    thread: Omit<ThreadRecord, "id" | "created_at" | "updated_at" | "version"> & {
      id?: string
      search_text: string
      created_at?: Date
    },
    messages: Array<NewMessage & { created_at?: Date }>,
    @MedusaContext() context: Context = {}
  ): Promise<{ thread: ThreadRecord; messages: MessageRecord[] }> {
    const manager = context.transactionManager as unknown as SqlManager
    const id = thread.id ?? generateEntityId(undefined, "negt")
    const created = thread.created_at ?? new Date()
    const values: Record<string, unknown> = { ...thread, id, version: 1, created_at: created, updated_at: created }
    const columns = Object.keys(values)
    const [row] = await manager.execute(
      `insert into "negotiation_thread" (${columns.map((c) => `"${c}"`).join(", ")}) values (${columns
        .map((c) => (JSON_COLUMNS.has(c) ? "?::jsonb" : "?"))
        .join(", ")}) returning *`,
      columns.map((c) => (JSON_COLUMNS.has(c) ? JSON.stringify(values[c]) : (values[c] ?? null)))
    )
    const inserted: MessageRecord[] = []
    for (const message of messages) {
      inserted.push(await this.insertMessage_(manager, id, message, thread.is_demo, message.created_at ?? created))
    }
    return { thread: toThread(row), messages: inserted }
  }

  protected async insertMessage_(
    manager: SqlManager,
    threadId: string,
    m: NewMessage,
    isDemo: boolean,
    at: Date
  ): Promise<MessageRecord> {
    const [row] = await manager.execute(
      `insert into "negotiation_message" ("id", "thread_id", "author", "author_id", "type", "body", "price", "price_total", "internal", "is_demo", "created_at", "updated_at") ` +
        `values (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?) returning *`,
      [
        generateEntityId(undefined, "negm"),
        threadId,
        m.author,
        m.author_id,
        m.type,
        m.body ?? null,
        m.price ? JSON.stringify(m.price) : null,
        m.price ? m.price.total : null,
        Boolean(m.internal),
        isDemo,
        at,
        at,
      ]
    )
    return toMessage(row)
  }

  @InjectManager()
  async getThread(id: string, @MedusaContext() context: Context = {}): Promise<ThreadRecord | null> {
    const manager = context.manager as unknown as SqlManager
    const [row] = await manager.execute(`select * from "negotiation_thread" where "id" = ? and "deleted_at" is null`, [
      id,
    ])
    return row ? toThread(row) : null
  }

  @InjectManager()
  async listMessages(
    threadId: string,
    options: { internal: boolean },
    @MedusaContext() context: Context = {}
  ): Promise<MessageRecord[]> {
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select * from "negotiation_message" where "thread_id" = ? and "deleted_at" is null ${
        options.internal ? "" : `and "internal" = false`
      } order by "created_at" asc, "id" asc`,
      [threadId]
    )
    return rows.map(toMessage)
  }

  /** Threads matching the filters, newest activity first, with the total count. */
  @InjectManager()
  async listThreads(
    filters: ThreadFilters,
    @MedusaContext() context: Context = {}
  ): Promise<{ threads: ThreadRecord[]; count: number }> {
    const manager = context.manager as unknown as SqlManager
    const { where, params } = this.threadWhere_(filters)
    const [{ count }] = await manager.execute(
      `select count(*) as "count" from "negotiation_thread" where ${where}`,
      params
    )
    const rows = await manager.execute(
      `select * from "negotiation_thread" where ${where} order by "last_activity_at" desc, "id" desc limit ? offset ?`,
      [...params, filters.limit ?? 50, filters.offset ?? 0]
    )
    return { threads: rows.map(toThread), count: num(count) }
  }

  protected threadWhere_(filters: ThreadFilters) {
    const clauses = [`"deleted_at" is null`, `"is_demo" = ?`]
    const params: unknown[] = [filters.is_demo]
    if (filters.status?.length) {
      clauses.push(`"status" in ${inList(filters.status)}`)
      params.push(...filters.status)
    }
    if (filters.waiting) clauses.push(`"turn" = 'team' and "status" in ${ACTIVE_SQL}`)
    if (filters.assignee_id === null) clauses.push(`"assignee_id" is null`)
    else if (filters.assignee_id !== undefined) {
      clauses.push(`"assignee_id" = ?`)
      params.push(filters.assignee_id)
    }
    if (filters.customer_id) {
      clauses.push(`"customer_id" = ?`)
      params.push(filters.customer_id)
    }
    if (filters.product_id) {
      clauses.push(`("product_id" = ? or "lines" @> ?::jsonb)`)
      params.push(filters.product_id, JSON.stringify([{ product_id: filters.product_id }]))
    }
    if (filters.q?.trim()) {
      clauses.push(`"search_text" like ?`)
      params.push(
        `%${filters.q
          .trim()
          .toLowerCase()
          .replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      )
    }
    return { where: clauses.join(" and "), params }
  }

  /** Counts per status for the filter chips, plus the threads waiting for the team. */
  @InjectManager()
  async statusCounts(
    filters: Omit<ThreadFilters, "status">,
    @MedusaContext() context: Context = {}
  ): Promise<Record<string, number>> {
    const manager = context.manager as unknown as SqlManager
    const { where, params } = this.threadWhere_(filters)
    const rows = await manager.execute(
      `select "status", count(*) as "count", count(*) filter (where "turn" = 'team') as "waiting" from "negotiation_thread" where ${where} group by "status"`,
      params
    )
    const counts: Record<string, number> = { waiting: 0 }
    for (const row of rows) {
      counts[row.status] = num(row.count)
      counts.waiting += num(row.waiting)
    }
    return counts
  }

  /** The active thread that has waited longest for the team. */
  @InjectManager()
  async oldestWaiting(isDemo: boolean, @MedusaContext() context: Context = {}): Promise<string | null> {
    const manager = context.manager as unknown as SqlManager
    const [row] = await manager.execute(
      `select "id" from "negotiation_thread" where "deleted_at" is null and "is_demo" = ? and "status" in ${ACTIVE_SQL} and "turn" = 'team' order by "last_activity_at" asc limit 1`,
      [isDemo]
    )
    return row?.id ?? null
  }

  /**
   * Applies one move as a single conditional UPDATE. When no row matches
   * (another move came first, or the price changed), nothing is written and
   * a conflict carrying the current thread is thrown.
   */
  @InjectManager()
  async applyMove(
    id: string,
    input: MoveInput,
    @MedusaContext() context: Context = {}
  ): Promise<{ thread: ThreadRecord; message: MessageRecord }> {
    return await this.applyMove_(id, input, context)
  }

  @InjectTransactionManager()
  protected async applyMove_(
    id: string,
    input: MoveInput,
    @MedusaContext() context: Context = {}
  ): Promise<{ thread: ThreadRecord; message: MessageRecord }> {
    const manager = context.transactionManager as unknown as SqlManager
    const rule = MOVES[input.move]
    const sets: string[] = [`"version" = "version" + 1`, `"updated_at" = ?`]
    const params: unknown[] = [input.now]
    if (rule.to) {
      sets.push(`"status" = ?`)
      params.push(rule.to)
    }
    sets.push(`"turn" = ?`)
    params.push(rule.turn)
    if (rule.activity) {
      sets.push(`"last_activity_at" = ?`, `"last_author" = ?`)
      params.push(input.now, input.message.author)
    }
    if (input.actor.type === "user" && rule.activity) {
      sets.push(`"first_team_reply_at" = coalesce("first_team_reply_at", ?)`)
      params.push(input.now)
    }
    for (const [column, value] of Object.entries(input.patch ?? {})) {
      if (!PATCHABLE.has(column)) throw new NegotiationError("invalid_input", { details: `cannot change ${column}` })
      sets.push(`"${column}" = ${JSON_COLUMNS.has(column) ? "?::jsonb" : "?"}`)
      params.push(JSON_COLUMNS.has(column) ? (value === null ? null : JSON.stringify(value)) : (value ?? null))
    }
    const where = [`"id" = ?`, `"deleted_at" is null`, `"status" in ${inList([...rule.from])}`]
    params.push(id, ...rule.from)
    if (input.version !== null) {
      where.push(`"version" = ?`)
      params.push(input.version)
    }
    if (input.expectPrice) {
      where.push(`"${input.expectPrice.column}" = ?`)
      params.push(input.expectPrice.value)
    }
    const [row] = await manager.execute(
      `update "negotiation_thread" set ${sets.join(", ")} where ${where.join(" and ")} returning *`,
      params
    )
    if (!row) {
      const [currentRow] = await manager.execute(
        `select * from "negotiation_thread" where "id" = ? and "deleted_at" is null`,
        [id]
      )
      if (!currentRow) throw new NegotiationError("not_found")
      const current = toThread(currentRow)
      const priceMoved =
        input.expectPrice !== undefined && (current[input.expectPrice.column] ?? null) !== input.expectPrice.value
      throw new NegotiationError(priceMoved ? "price_changed" : "conflict").withState(current)
    }
    const thread = toThread(row)
    const message = await this.insertMessage_(manager, id, input.message, thread.is_demo, input.now)
    return { thread, message }
  }

  /** An internal note: appended, but the thread's status, turn, version and activity stay as they are. */
  @InjectManager()
  async addNote(
    id: string,
    input: { author_id: string | null; body: string; now: Date },
    @MedusaContext() context: Context = {}
  ): Promise<{ thread: ThreadRecord; message: MessageRecord }> {
    return await this.addNote_(id, input, context)
  }

  @InjectTransactionManager()
  protected async addNote_(
    id: string,
    input: { author_id: string | null; body: string; now: Date },
    @MedusaContext() context: Context = {}
  ): Promise<{ thread: ThreadRecord; message: MessageRecord }> {
    const manager = context.transactionManager as unknown as SqlManager
    const [row] = await manager.execute(`select * from "negotiation_thread" where "id" = ? and "deleted_at" is null`, [
      id,
    ])
    if (!row) throw new NegotiationError("not_found")
    const thread = toThread(row)
    const message = await this.insertMessage_(
      manager,
      id,
      { author: "team", author_id: input.author_id, type: "internal_note", body: input.body, internal: true },
      thread.is_demo,
      input.now
    )
    return { thread, message }
  }

  /** A system entry that does not change the thread (lines added to a cart, a draft order). */
  @InjectManager()
  async addSystemMessage(
    id: string,
    input: {
      type: MessageType
      body: string | null
      now: Date
      patch?: Partial<Record<"draft_order_id" | "order_id", string>>
    },
    @MedusaContext() context: Context = {}
  ): Promise<{ thread: ThreadRecord; message: MessageRecord }> {
    return await this.addSystemMessage_(id, input, context)
  }

  @InjectTransactionManager()
  protected async addSystemMessage_(
    id: string,
    input: {
      type: MessageType
      body: string | null
      now: Date
      patch?: Partial<Record<"draft_order_id" | "order_id", string>>
    },
    @MedusaContext() context: Context = {}
  ): Promise<{ thread: ThreadRecord; message: MessageRecord }> {
    const manager = context.transactionManager as unknown as SqlManager
    const sets = [`"updated_at" = ?`]
    const params: unknown[] = [input.now]
    for (const [column, value] of Object.entries(input.patch ?? {})) {
      sets.push(`"${column}" = ?`)
      params.push(value)
    }
    const [row] = await manager.execute(
      `update "negotiation_thread" set ${sets.join(", ")} where "id" = ? and "deleted_at" is null returning *`,
      [...params, id]
    )
    if (!row) throw new NegotiationError("not_found")
    const thread = toThread(row)
    const message = await this.insertMessage_(
      manager,
      id,
      { author: "system", author_id: null, type: input.type, body: input.body },
      thread.is_demo,
      input.now
    )
    return { thread, message }
  }

  /** Records the order placed from the thread's cart lines; no further cart writes after that. */
  @InjectManager()
  async setOrder(id: string, orderId: string, @MedusaContext() context: Context = {}): Promise<void> {
    return await this.setOrder_(id, orderId, context)
  }

  @InjectTransactionManager()
  protected async setOrder_(id: string, orderId: string, @MedusaContext() context: Context = {}): Promise<void> {
    const manager = context.transactionManager as unknown as SqlManager
    await manager.execute(
      `update "negotiation_thread" set "order_id" = ?, "updated_at" = now() where "id" = ? and "order_id" is null and "deleted_at" is null`,
      [orderId, id]
    )
  }

  /** Sets the person leading the thread. Not a move: the version stays. */
  @InjectManager()
  async assign(id: string, userId: string | null, @MedusaContext() context: Context = {}): Promise<ThreadRecord> {
    return await this.assign_(id, userId, context)
  }

  @InjectTransactionManager()
  protected async assign_(
    id: string,
    userId: string | null,
    @MedusaContext() context: Context = {}
  ): Promise<ThreadRecord> {
    const manager = context.transactionManager as unknown as SqlManager
    const [row] = await manager.execute(
      `update "negotiation_thread" set "assignee_id" = ?, "updated_at" = now() where "id" = ? and "deleted_at" is null returning *`,
      [userId, id]
    )
    if (!row) throw new NegotiationError("not_found")
    return toThread(row)
  }

  /**
   * Expiry, as two conditional UPDATEs: counter-offers past their deadline
   * lapse (the thread goes back to the team), then threads with no move for
   * `expiryDays` expire. Demo threads are left alone. A thread moved by a
   * person in the same instant is not matched, so it is never closed twice.
   */
  @InjectManager()
  async expire(
    input: { now: Date; expiryDays: number },
    @MedusaContext() context: Context = {}
  ): Promise<{
    lapsed: ThreadRecord[]
    expired: ThreadRecord[]
    offerMessages: Record<string, MessageRecord>
    expiryMessages: Record<string, MessageRecord>
  }> {
    return await this.expire_(input, context)
  }

  @InjectTransactionManager()
  protected async expire_(
    input: { now: Date; expiryDays: number },
    @MedusaContext() context: Context = {}
  ): Promise<{
    lapsed: ThreadRecord[]
    expired: ThreadRecord[]
    offerMessages: Record<string, MessageRecord>
    expiryMessages: Record<string, MessageRecord>
  }> {
    const manager = context.transactionManager as unknown as SqlManager
    const offerMessages: Record<string, MessageRecord> = {}
    const expiryMessages: Record<string, MessageRecord> = {}
    const lapsedRows = await manager.execute(
      `update "negotiation_thread" set "status" = 'open', "turn" = 'team', "offer" = null, "offer_total" = null, "offer_expires_at" = null, ` +
        `"version" = "version" + 1, "updated_at" = ? ` +
        `where "deleted_at" is null and "is_demo" = false and "status" = 'countered' and "offer_expires_at" is not null and "offer_expires_at" <= ? returning *`,
      [input.now, input.now]
    )
    const lapsed = lapsedRows.map(toThread)
    for (const t of lapsed) {
      offerMessages[t.id] = await this.insertMessage_(
        manager,
        t.id,
        { author: "system", author_id: null, type: "offer_expired", body: null },
        false,
        input.now
      )
    }
    let expired: ThreadRecord[] = []
    if (input.expiryDays > 0) {
      const cutoff = new Date(input.now.getTime() - input.expiryDays * 86_400_000)
      const rows = await manager.execute(
        `update "negotiation_thread" set "status" = 'expired', "turn" = null, "closed_at" = ?, "version" = "version" + 1, "updated_at" = ? ` +
          `where "deleted_at" is null and "is_demo" = false and "status" in ${ACTIVE_SQL} and "last_activity_at" <= ? returning *`,
        [input.now, input.now, cutoff]
      )
      expired = rows.map(toThread)
      for (const t of expired) {
        expiryMessages[t.id] = await this.insertMessage_(
          manager,
          t.id,
          { author: "system", author_id: null, type: "expiry", body: null },
          false,
          input.now
        )
      }
    }
    return { lapsed, expired, offerMessages, expiryMessages }
  }

  /** What a customer has done recently, for the limits. */
  @InjectManager()
  async customerActivity(customerId: string, now: Date, @MedusaContext() context: Context = {}) {
    const manager = context.manager as unknown as SqlManager
    const hourAgo = new Date(now.getTime() - 3_600_000)
    const [threads] = await manager.execute(
      `select count(*) filter (where "status" in ${ACTIVE_SQL}) as "open", count(*) filter (where "created_at" > ?) as "recent" ` +
        `from "negotiation_thread" where "customer_id" = ? and "is_demo" = false and "deleted_at" is null`,
      [hourAgo, customerId]
    )
    const [messages] = await manager.execute(
      `select count(*) as "count" from "negotiation_message" where "author" = 'customer' and "author_id" = ? and "created_at" > ? and "deleted_at" is null`,
      [customerId, hourAgo]
    )
    return {
      open_threads: num(threads?.open),
      threads_last_hour: num(threads?.recent),
      messages_last_hour: num(messages?.count),
    }
  }

  /* Minimum prices --------------------------------------------------------- */

  @InjectManager()
  async getFloors(
    variantIds: string[],
    currency: string | null,
    @MedusaContext() context: Context = {}
  ): Promise<Array<{ variant_id: string; currency_code: string; amount: number }>> {
    if (!variantIds.length) return []
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select "variant_id", "currency_code", "amount" from "negotiation_variant_floor" where "deleted_at" is null and "variant_id" in ${inList(
        variantIds
      )} ${currency ? `and "currency_code" = ?` : ""} order by "currency_code"`,
      currency ? [...variantIds, currency] : variantIds
    )
    return rows.map((r) => ({ variant_id: r.variant_id, currency_code: r.currency_code, amount: num(r.amount) }))
  }

  /** Replaces a variant's minimum prices (one per currency). */
  @InjectManager()
  async setFloors(
    variantId: string,
    floors: Array<{ currency_code: string; amount: number }>,
    @MedusaContext() context: Context = {}
  ): Promise<void> {
    return await this.setFloors_(variantId, floors, context)
  }

  @InjectTransactionManager()
  protected async setFloors_(
    variantId: string,
    floors: Array<{ currency_code: string; amount: number }>,
    @MedusaContext() context: Context = {}
  ): Promise<void> {
    const manager = context.transactionManager as unknown as SqlManager
    await manager.execute(`delete from "negotiation_variant_floor" where "variant_id" = ?`, [variantId])
    for (const floor of floors) {
      await manager.execute(
        `insert into "negotiation_variant_floor" ("id", "variant_id", "currency_code", "amount", "created_at", "updated_at") values (?, ?, ?, ?, now(), now())`,
        [generateEntityId(undefined, "negf"), variantId, floor.currency_code.toLowerCase(), floor.amount]
      )
    }
  }

  /* Writes ----------------------------------------------------------------- */

  /**
   * Reserves a write. Partial unique indexes allow one live draft order per
   * thread and one live cart write per thread, so of two parallel claims
   * only one gets a row; the other gets `null`.
   */
  @InjectManager()
  async claimWrite(
    threadId: string,
    kind: "draft_order" | "cart",
    actorId: string | null,
    @MedusaContext() context: Context = {}
  ): Promise<WriteRecord | null> {
    return await this.claimWrite_(threadId, kind, actorId, context)
  }

  @InjectTransactionManager()
  protected async claimWrite_(
    threadId: string,
    kind: "draft_order" | "cart",
    actorId: string | null,
    @MedusaContext() context: Context = {}
  ): Promise<WriteRecord | null> {
    const manager = context.transactionManager as unknown as SqlManager
    const [row] = await manager.execute(
      `insert into "negotiation_write" ("id", "thread_id", "kind", "status", "actor_id", "created_at", "updated_at") values (?, ?, ?, 'pending', ?, now(), now()) ` +
        `on conflict do nothing returning *`,
      [generateEntityId(undefined, "negw"), threadId, kind, actorId]
    )
    return row ? toWrite(row) : null
  }

  @InjectManager()
  async updateWrite(
    id: string,
    patch: {
      status: WriteRecord["status"]
      target_id?: string | null
      line_item_ids?: string[] | null
      error?: string | null
    },
    @MedusaContext() context: Context = {}
  ): Promise<WriteRecord> {
    return await this.updateWrite_(id, patch, context)
  }

  @InjectTransactionManager()
  protected async updateWrite_(
    id: string,
    patch: {
      status: WriteRecord["status"]
      target_id?: string | null
      line_item_ids?: string[] | null
      error?: string | null
    },
    @MedusaContext() context: Context = {}
  ): Promise<WriteRecord> {
    const manager = context.transactionManager as unknown as SqlManager
    const [row] = await manager.execute(
      `update "negotiation_write" set "status" = ?, "target_id" = coalesce(?, "target_id"), "line_item_ids" = coalesce(?::jsonb, "line_item_ids"), "error" = ?, "updated_at" = now() where "id" = ? returning *`,
      [
        patch.status,
        patch.target_id ?? null,
        patch.line_item_ids ? JSON.stringify(patch.line_item_ids) : null,
        patch.error ?? null,
        id,
      ]
    )
    if (!row) throw new NegotiationError("not_found")
    return toWrite(row)
  }

  @InjectManager()
  async listWrites(threadId: string, @MedusaContext() context: Context = {}): Promise<WriteRecord[]> {
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select * from "negotiation_write" where "thread_id" = ? and "deleted_at" is null order by "created_at" asc`,
      [threadId]
    )
    return rows.map(toWrite)
  }

  /** Finished cart writes into one cart, whatever their thread (checkout validation). */
  @InjectManager()
  async cartWritesFor(cartId: string, @MedusaContext() context: Context = {}): Promise<WriteRecord[]> {
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select * from "negotiation_write" where "kind" = 'cart' and "status" = 'done' and "deleted_at" is null and "target_id" = ?`,
      [cartId]
    )
    return rows.map(toWrite)
  }

  /** Cart writes whose lines are in this cart, for checkout validation. */
  @InjectManager()
  async liveCartWrites(threadIds: string[], @MedusaContext() context: Context = {}): Promise<WriteRecord[]> {
    if (!threadIds.length) return []
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select * from "negotiation_write" where "kind" = 'cart' and "status" = 'done' and "deleted_at" is null and "thread_id" in ${inList(threadIds)}`,
      threadIds
    )
    return rows.map(toWrite)
  }

  @InjectManager()
  async recordRun(
    run: {
      thread_id: string
      writer: "draft_order" | "cart"
      stage: "plan" | "dry_run" | "commit" | "error"
      actor: Actor
      input?: unknown
      result?: unknown
      error?: string | null
    },
    @MedusaContext() context: Context = {}
  ): Promise<{ id: string; created_at: Date }> {
    return await this.recordRun_(run, context)
  }

  @InjectTransactionManager()
  protected async recordRun_(
    run: {
      thread_id: string
      writer: "draft_order" | "cart"
      stage: "plan" | "dry_run" | "commit" | "error"
      actor: Actor
      input?: unknown
      result?: unknown
      error?: string | null
    },
    @MedusaContext() context: Context = {}
  ): Promise<{ id: string; created_at: Date }> {
    const manager = context.transactionManager as unknown as SqlManager
    const [row] = await manager.execute(
      `insert into "negotiation_write_run" ("id", "thread_id", "writer", "stage", "actor_type", "actor_id", "input", "result", "error", "created_at", "updated_at") ` +
        `values (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, now(), now()) returning "id", "created_at"`,
      [
        generateEntityId(undefined, "negr"),
        run.thread_id,
        run.writer,
        run.stage,
        run.actor.type,
        run.actor.id,
        run.input === undefined ? null : JSON.stringify(run.input),
        run.result === undefined ? null : JSON.stringify(run.result),
        run.error ?? null,
      ]
    )
    return { id: row.id, created_at: date(row.created_at) }
  }

  @InjectManager()
  async getRun(id: string, @MedusaContext() context: Context = {}): Promise<Row | null> {
    const manager = context.manager as unknown as SqlManager
    const [row] = await manager.execute(
      `select * from "negotiation_write_run" where "id" = ? and "deleted_at" is null`,
      [id]
    )
    return row
      ? { ...row, input: row.input ? json(row.input) : null, result: row.result ? json(row.result) : null }
      : null
  }

  @InjectManager()
  async listRuns(
    filters: { thread_id?: string; limit?: number },
    @MedusaContext() context: Context = {}
  ): Promise<Row[]> {
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select r.*, t."number" from "negotiation_write_run" r left join "negotiation_thread" t on t."id" = r."thread_id" ` +
        `where r."deleted_at" is null ${filters.thread_id ? `and r."thread_id" = ?` : ""} order by r."created_at" desc limit ?`,
      filters.thread_id ? [filters.thread_id, filters.limit ?? 100] : [filters.limit ?? 100]
    )
    return rows.map((row) => ({
      ...row,
      input: row.input ? json(row.input) : null,
      result: row.result ? json(row.result) : null,
    }))
  }

  /* Dashboard -------------------------------------------------------------- */

  @InjectManager()
  async stats(input: { is_demo: boolean; now: Date; expiryDays: number }, @MedusaContext() context: Context = {}) {
    const manager = context.manager as unknown as SqlManager
    const since = new Date(input.now.getTime() - 30 * 86_400_000)
    const soon = new Date(input.now.getTime() + 2 * 86_400_000)
    const [row] = await manager.execute(
      `select ` +
        `count(*) filter (where "status" in ${ACTIVE_SQL} and "turn" = 'team') as "waiting", ` +
        `count(*) filter (where "status" = 'open') as "open", ` +
        `count(*) filter (where "status" = 'countered') as "countered", ` +
        `count(*) filter (where "status" = 'accepted' and "accepted_at" >= ?) as "accepted_30", ` +
        `count(*) filter (where "status" = 'rejected' and "closed_at" >= ?) as "rejected_30", ` +
        `count(*) filter (where "status" = 'expired' and "closed_at" >= ?) as "expired_30", ` +
        `count(*) filter (where "status" in ${ACTIVE_SQL} and (` +
        `("status" = 'countered' and "offer_expires_at" > ? and "offer_expires_at" <= ?)` +
        (input.expiryDays > 0
          ? ` or ("last_activity_at" + make_interval(days => ?) > ? and "last_activity_at" + make_interval(days => ?) <= ?)`
          : "") +
        `)) as "expiring", ` +
        `avg(extract(epoch from ("first_team_reply_at" - "created_at"))) filter (where "first_team_reply_at" is not null and "created_at" >= ?) as "first_reply_seconds" ` +
        `from "negotiation_thread" where "deleted_at" is null and "is_demo" = ?`,
      [
        since,
        since,
        since,
        input.now,
        soon,
        ...(input.expiryDays > 0 ? [input.expiryDays, input.now, input.expiryDays, soon] : []),
        since,
        input.is_demo,
      ]
    )
    const money = await manager.execute(
      `select "currency_code", ` +
        `coalesce(sum(coalesce("offer_total", "target_total")) filter (where "status" in ${ACTIVE_SQL}), 0) as "in_talks", ` +
        `coalesce(sum("accepted_total") filter (where "status" = 'accepted' and "accepted_at" >= ?), 0) as "agreed_30" ` +
        `from "negotiation_thread" where "deleted_at" is null and "is_demo" = ? group by "currency_code"`,
      [since, input.is_demo]
    )
    const totals = (key: string) =>
      Object.fromEntries(money.map((m) => [m.currency_code, num(m[key])]).filter(([, v]) => (v as number) > 0))
    return {
      waiting: num(row.waiting),
      open: num(row.open),
      countered: num(row.countered),
      accepted_30: num(row.accepted_30),
      rejected_30: num(row.rejected_30),
      expired_30: num(row.expired_30),
      expiring_soon: num(row.expiring),
      first_reply_seconds: row.first_reply_seconds === null ? null : Math.round(Number(row.first_reply_seconds)),
      in_talks: totals("in_talks"),
      agreed_30: totals("agreed_30"),
    }
  }

  /* Demo ------------------------------------------------------------------- */

  /** Removes demo threads, their messages and runs (the append-only trigger lets demo rows go). */
  @InjectManager()
  async clearDemo(@MedusaContext() context: Context = {}): Promise<void> {
    return await this.clearDemo_(context)
  }

  @InjectTransactionManager()
  protected async clearDemo_(@MedusaContext() context: Context = {}): Promise<void> {
    const manager = context.transactionManager as unknown as SqlManager
    await manager.execute(`delete from "negotiation_message" where "is_demo" = true`)
    await manager.execute(
      `delete from "negotiation_write_run" where "thread_id" in (select "id" from "negotiation_thread" where "is_demo" = true)`
    )
    await manager.execute(`delete from "negotiation_thread" where "is_demo" = true`)
  }

  @InjectManager()
  async hasDemo(@MedusaContext() context: Context = {}): Promise<boolean> {
    const manager = context.manager as unknown as SqlManager
    const [row] = await manager.execute(
      `select 1 from "negotiation_thread" where "is_demo" = true and "deleted_at" is null limit 1`
    )
    return Boolean(row)
  }
}

export default NegotiationsModuleService
