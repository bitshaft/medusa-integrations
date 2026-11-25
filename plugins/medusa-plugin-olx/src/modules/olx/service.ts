import type { Context, Logger } from "@medusajs/framework/types"
import { InjectManager, InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"

import type { ConnectionStore, TokenSet } from "../../lib/olx/auth"
import { OlxTokens } from "../../lib/olx/auth"
import { type OlxApi, OlxClient } from "../../lib/olx/client"
import { createState, decryptSecret, encryptSecret, hashState } from "../../lib/olx/crypto"
import { DemoOlxApi } from "../../lib/olx/demo"
import type { AdvertStore } from "../../lib/olx/engine"
import { logPluginDisabled, pluginDisabledError } from "../../lib/olx/kit/options"
import { type OlxPluginOptions, parseOptions, PLUGIN_NAME } from "../../lib/olx/options"
import {
  type AdvertInput,
  type AdvertRecord,
  type Connection,
  DEFAULT_SETTINGS,
  LIVE_STATUSES,
  type SoldChannel,
  type StoreDefaults,
  type SyncCursor,
} from "../../lib/olx/types"
import { OlxAdvert } from "./models/advert"
import { OlxConnection } from "./models/connection"
import { OlxOauthState } from "./models/oauth-state"
import { OlxSetting } from "./models/setting"

type InjectedDependencies = { logger: Logger }
type SqlManager = { execute(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }

const SETTINGS_KEY = "defaults"
const CURSOR_KEY = "sync_cursor"
const CONNECTION_KEY = "default"
const STATE_TTL_MS = 10 * 60_000

const date = (value: unknown): Date | null => (value ? new Date(value as string) : null)

function toRecord(row: Record<string, unknown>): AdvertRecord {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload
  return {
    id: String(row.id),
    variant_id: String(row.variant_id),
    product_id: String(row.product_id),
    demo: Boolean(row.demo),
    olx_advert_id: (row.olx_advert_id as string | null) ?? null,
    status: String(row.status),
    url: (row.url as string | null) ?? null,
    valid_to: date(row.valid_to),
    title: String(row.title),
    price: String(row.price),
    payload: payload as AdvertInput,
    last_error: (row.last_error as string | null) ?? null,
    pending_deactivate: Boolean(row.pending_deactivate),
    pending_success: Boolean(row.pending_success),
    sold_channel: (row.sold_channel as AdvertRecord["sold_channel"]) ?? null,
    sold_at: date(row.sold_at),
    claimed_at: date(row.claimed_at),
    write_started_at: date(row.write_started_at),
    synced_at: date(row.synced_at),
    created_at: date(row.created_at) ?? undefined,
  }
}

const records = (rows: unknown[]) => rows.map((row) => toRecord(row as Record<string, unknown>))

/**
 * The plugin's own module: the connected account, one advert per variant,
 * the defaults for new adverts and the position in OLX's change feed.
 */
export default class OlxModuleService
  extends MedusaService({ OlxAdvert, OlxConnection, OlxOauthState, OlxSetting })
  implements AdvertStore, ConnectionStore
{
  protected readonly logger_: Logger
  private readonly state_: { options: OlxPluginOptions } | { disabled: string }
  private api_: OlxApi | null = null

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

  async isEnabled(): Promise<boolean> {
    return !("disabled" in this.state_)
  }

  /** Why the plugin is disabled (safe to show: never contains option values). */
  async getDisabledReason(): Promise<string | null> {
    return "disabled" in this.state_ ? this.state_.disabled : null
  }

  async getOptions(): Promise<OlxPluginOptions> {
    if ("disabled" in this.state_) {
      throw pluginDisabledError(PLUGIN_NAME, this.state_.disabled)
    }
    return this.state_.options
  }

  /** OLX, or the simulated one of demo mode. */
  async getApi(): Promise<OlxApi> {
    const options = await this.getOptions()
    if (!this.api_) {
      if (options.demo) {
        this.api_ = new DemoOlxApi(this)
      } else {
        const tokens = new OlxTokens(options, this, this.logger_)
        this.api_ = new OlxClient({
          baseUrl: options.baseUrl,
          timeoutMs: options.timeoutMs,
          clientSecret: options.clientSecret,
          logger: this.logger_,
          token: (force) => tokens.accessToken(force),
        })
      }
    }
    return this.api_
  }

  /* Connection -------------------------------------------------------------- */

  private async connectionRow() {
    const [row] = await this.listOlxConnections({ key: CONNECTION_KEY }, { take: 1 })
    return row ?? null
  }

  /** The tokens in plain form. A row sealed with another key counts as needing a new connection. */
  async readConnection(): Promise<Connection | null> {
    const row = await this.connectionRow()
    if (!row) {
      return null
    }
    const { encryptionKey } = await this.getOptions()
    const access = decryptSecret(row.access_token, encryptionKey ?? "")
    const refresh = decryptSecret(row.refresh_token, encryptionKey ?? "")
    const unreadable = access === null || refresh === null
    return {
      olx_user_id: row.olx_user_id ?? null,
      olx_user_name: row.olx_user_name ?? null,
      is_business: Boolean(row.is_business),
      access_token: access ?? "",
      refresh_token: refresh ?? "",
      access_expires_at: new Date(row.access_expires_at as unknown as string),
      needs_reconnect: unreadable || Boolean(row.needs_reconnect),
      last_error: unreadable
        ? "The saved OLX tokens cannot be read with the current encryptionKey. Connect the account again."
        : (row.last_error ?? null),
    }
  }

  /** What the admin may see about the connection: never a token. */
  async describeConnection() {
    const options = await this.getOptions()
    if (options.demo) {
      return { connected: true, needs_reconnect: false, user_name: "Demo account", is_business: true, last_error: null }
    }
    const connection = await this.readConnection()
    return {
      connected: Boolean(connection),
      needs_reconnect: Boolean(connection?.needs_reconnect),
      user_name: connection?.olx_user_name ?? null,
      is_business: Boolean(connection?.is_business),
      last_error: connection?.last_error ?? null,
    }
  }

  private async seal(tokens: TokenSet) {
    const { encryptionKey } = await this.getOptions()
    return {
      access_token: encryptSecret(tokens.access_token, encryptionKey ?? ""),
      refresh_token: encryptSecret(tokens.refresh_token, encryptionKey ?? ""),
      access_expires_at: tokens.access_expires_at,
    }
  }

  async saveTokens(tokens: TokenSet): Promise<void> {
    const row = await this.connectionRow()
    if (row) {
      await this.updateOlxConnections({
        id: row.id,
        ...(await this.seal(tokens)),
        needs_reconnect: false,
        last_error: null,
      })
    }
  }

  async markNeedsReconnect(reason: string): Promise<void> {
    const row = await this.connectionRow()
    if (row) {
      await this.updateOlxConnections({ id: row.id, needs_reconnect: true, last_error: reason })
    }
  }

  /** Stores a new connection in place of the old one. */
  async connect(tokens: TokenSet, user: { id: string | null; name: string | null; is_business: boolean }) {
    const data = {
      ...(await this.seal(tokens)),
      olx_user_id: user.id,
      olx_user_name: user.name,
      is_business: user.is_business,
      needs_reconnect: false,
      last_error: null,
    }
    const row = await this.connectionRow()
    if (row) {
      await this.updateOlxConnections({ id: row.id, ...data })
    } else {
      await this.createOlxConnections({ key: CONNECTION_KEY, ...data })
    }
  }

  async disconnect(): Promise<void> {
    const row = await this.connectionRow()
    if (row) {
      // A hard delete: the tokens do not stay behind.
      await this.deleteOlxConnections(row.id)
    }
  }

  /** Starts "Connect OLX": the state for the consent screen. */
  async startOauth(now = new Date()): Promise<string> {
    const stale = await this.listOlxOauthStates({ expires_at: { $lt: now } }, { select: ["id"] })
    if (stale.length) {
      await this.deleteOlxOauthStates(stale.map((row) => row.id))
    }
    const state = createState()
    await this.createOlxOauthStates({
      state_hash: hashState(state),
      expires_at: new Date(now.getTime() + STATE_TTL_MS),
    })
    return state
  }

  /** Spends a state. True exactly once, and only while it is valid. */
  @InjectManager()
  async consumeOauthState(state: string, now = new Date(), @MedusaContext() context: Context = {}): Promise<boolean> {
    return this.consumeOauthState_(hashState(state), now, context)
  }

  @InjectTransactionManager()
  protected async consumeOauthState_(
    hash: string,
    now: Date,
    @MedusaContext() context: Context = {}
  ): Promise<boolean> {
    const manager = context.transactionManager as unknown as SqlManager
    const rows = await manager.execute(
      `delete from "olx_oauth_state" where "state_hash" = ? and "deleted_at" is null and "expires_at" > ? returning "id"`,
      [hash, now]
    )
    return rows.length === 1
  }

  /* Settings ---------------------------------------------------------------- */

  private async readValue(key: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.listOlxSettings({ key }, { take: 1 })
    return (row?.value as Record<string, unknown>) ?? null
  }

  private async writeValue(key: string, value: Record<string, unknown>): Promise<void> {
    const [row] = await this.listOlxSettings({ key }, { take: 1 })
    if (row) {
      await this.updateOlxSettings({ id: row.id, value })
    } else {
      await this.createOlxSettings({ key, value })
    }
  }

  async getDefaults(): Promise<StoreDefaults> {
    return { ...DEFAULT_SETTINGS, ...((await this.readValue(SETTINGS_KEY)) as Partial<StoreDefaults> | null) }
  }

  async saveDefaults(value: StoreDefaults): Promise<StoreDefaults> {
    await this.writeValue(SETTINGS_KEY, value as unknown as Record<string, unknown>)
    return value
  }

  async readCursor(): Promise<SyncCursor | null> {
    return (await this.readValue(CURSOR_KEY)) as SyncCursor | null
  }

  async saveCursor(cursor: SyncCursor): Promise<void> {
    await this.writeValue(CURSOR_KEY, cursor as unknown as Record<string, unknown>)
  }

  /* Adverts (AdvertStore) --------------------------------------------------- */

  private async isDemo(): Promise<boolean> {
    return (await this.getOptions()).demo
  }

  async getRecord(id: string): Promise<AdvertRecord | null> {
    const [row] = await this.listOlxAdverts({ id, demo: await this.isDemo() }, { take: 1 })
    return row ? records([row])[0] : null
  }

  async findForVariant(variantId: string): Promise<AdvertRecord | null> {
    const [row] = await this.listOlxAdverts({ variant_id: variantId, demo: await this.isDemo() }, { take: 1 })
    return row ? records([row])[0] : null
  }

  async findByOlxId(olxId: string): Promise<AdvertRecord | null> {
    const [row] = await this.listOlxAdverts({ olx_advert_id: olxId, demo: await this.isDemo() }, { take: 1 })
    return row ? records([row])[0] : null
  }

  async listForProduct(productId: string): Promise<AdvertRecord[]> {
    return records(await this.listOlxAdverts({ product_id: productId, demo: await this.isDemo() }, { take: null }))
  }

  async listPage(params: { status?: string[]; q?: string; limit: number; offset: number }) {
    const filters: Record<string, unknown> = { demo: await this.isDemo() }
    if (params.status?.length) filters.status = params.status
    if (params.q) filters.title = { $ilike: `%${params.q.replace(/[\\%_]/g, "\\$&")}%` }
    const [rows, count] = await this.listAndCountOlxAdverts(filters, {
      take: params.limit,
      skip: params.offset,
      order: { created_at: "DESC" },
    })
    return { adverts: records(rows), count }
  }

  async counts(): Promise<Record<string, number>> {
    const rows = await this.listOlxAdverts({ demo: await this.isDemo() }, { take: null, select: ["status"] })
    const out: Record<string, number> = {}
    for (const row of rows) {
      out[row.status] = (out[row.status] ?? 0) + 1
    }
    return out
  }

  async listLive(variantIds?: string[]): Promise<AdvertRecord[]> {
    return records(
      await this.listOlxAdverts(
        {
          demo: await this.isDemo(),
          status: [...LIVE_STATUSES],
          pending_deactivate: false,
          ...(variantIds ? { variant_id: variantIds } : {}),
        },
        { take: null }
      )
    )
  }

  async listPublishing(): Promise<AdvertRecord[]> {
    return records(await this.listOlxAdverts({ demo: await this.isDemo(), status: "publishing" }, { take: null }))
  }

  async listPendingDeactivations(): Promise<AdvertRecord[]> {
    return records(await this.listOlxAdverts({ demo: await this.isDemo(), pending_deactivate: true }, { take: null }))
  }

  async createRecord(data: { variant_id: string; product_id: string; payload: AdvertInput }): Promise<AdvertRecord> {
    const row = await this.createOlxAdverts({
      variant_id: data.variant_id,
      product_id: data.product_id,
      demo: await this.isDemo(),
      status: "publishing",
      title: data.payload.title.trim(),
      price: data.payload.price,
      payload: data.payload as unknown as Record<string, unknown>,
    })
    return records([row])[0]
  }

  async patchRecord(id: string, patch: Partial<AdvertRecord>): Promise<AdvertRecord> {
    const { created_at: _created, ...data } = patch
    const row = await this.updateOlxAdverts({ id, ...(data as Record<string, unknown>) } as never)
    return records([row])[0]
  }

  /** Takes the advert with one conditional UPDATE, so two workers never write it at once. */
  @InjectManager()
  async claimRecord(
    id: string,
    now: Date,
    staleBefore: Date,
    @MedusaContext() context: Context = {}
  ): Promise<AdvertRecord | null> {
    return this.claimRecord_(id, now, staleBefore, context)
  }

  @InjectTransactionManager()
  protected async claimRecord_(
    id: string,
    now: Date,
    staleBefore: Date,
    @MedusaContext() context: Context = {}
  ): Promise<AdvertRecord | null> {
    const manager = context.transactionManager as unknown as SqlManager
    const rows = await manager.execute(
      `update "olx_advert" set "claimed_at" = ?, "updated_at" = now() ` +
        `where "id" = ? and "deleted_at" is null and ("claimed_at" is null or "claimed_at" < ?) returning *`,
      [now, id, staleBefore]
    )
    return rows[0] ? toRecord(rows[0]) : null
  }

  @InjectManager()
  async markForDeactivation(
    id: string,
    mark: { success: boolean; channel: SoldChannel | null; at: Date | null; statuses?: readonly string[] },
    @MedusaContext() context: Context = {}
  ): Promise<AdvertRecord | null> {
    return this.markForDeactivation_(id, mark, context)
  }

  @InjectTransactionManager()
  protected async markForDeactivation_(
    id: string,
    mark: { success: boolean; channel: SoldChannel | null; at: Date | null; statuses?: readonly string[] },
    @MedusaContext() context: Context = {}
  ): Promise<AdvertRecord | null> {
    const manager = context.transactionManager as unknown as SqlManager
    const statuses = mark.statuses ?? []
    const rows = await manager.execute(
      `update "olx_advert" set "pending_deactivate" = true, "pending_success" = ?, ` +
        `"sold_channel" = coalesce(?::text, "sold_channel"), "sold_at" = coalesce(?::timestamptz, "sold_at"), ` +
        `"updated_at" = now() where "id" = ? and "deleted_at" is null and "pending_deactivate" = false` +
        (statuses.length ? ` and "status" in (${statuses.map(() => "?").join(", ")})` : "") +
        ` returning *`,
      [mark.success, mark.channel, mark.at, id, ...statuses]
    )
    return rows[0] ? toRecord(rows[0]) : null
  }

  async removeDemoAdverts(): Promise<number> {
    const rows = await this.listOlxAdverts({ demo: true }, { take: null, select: ["id"] })
    if (rows.length) {
      await this.deleteOlxAdverts(rows.map((row) => row.id))
    }
    return rows.length
  }

  async hasDemoAdverts(): Promise<boolean> {
    return (await this.listOlxAdverts({ demo: true }, { take: 1, select: ["id"] })).length > 0
  }
}
