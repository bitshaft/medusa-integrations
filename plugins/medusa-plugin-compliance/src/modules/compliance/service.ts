import { randomBytes } from "node:crypto"

import type { Context, Logger } from "@medusajs/framework/types"
import {
  generateEntityId,
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"

import { toAmount } from "../../lib/compliance/format"
import { logPluginDisabled } from "../../lib/compliance/kit/options"
import { priceChanged, type PricePoint } from "../../lib/compliance/omnibus"
import { type CompliancePluginOptions, parseOptions, PLUGIN_NAME } from "../../lib/compliance/options"
import { type ComplianceSettings, readSettings, settingsSchema } from "../../lib/compliance/settings"
import type { DiscountKind, PriceSource, RequestStatus } from "../../lib/compliance/types"
import {
  ComplianceAnonymization,
  ComplianceConsentEntry,
  ComplianceConsentType,
  ComplianceConsentVersion,
  ComplianceManufacturer,
  ComplianceOrderRetention,
  CompliancePriceRecord,
  ComplianceProductSafety,
  ComplianceRequest,
  ComplianceRequestEvent,
  ComplianceSetting,
} from "./models"

type InjectedDependencies = { logger: Logger }
type SqlManager = { execute(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }

export const SETTINGS_KEY = "settings"
/** When price recording started (the installation snapshot). */
export const OMNIBUS_STARTED_KEY = "omnibus_started_at"
const IP_SALT_KEY = "ip_salt"

/** A price as observed now, ready to be compared with the last record. */
export type PriceObservation = {
  variant_id: string
  product_id: string
  region_id: string
  currency_code: string
  amount: number
  regular_amount: number
  discounted: boolean
  discount_kind: DiscountKind | null
  discount_ref: string | null
  /** For a first record: whether sales started now (a new variant) or earlier (the snapshot). */
  start_known: boolean
}

export type PriceRecordRow = PriceObservation & {
  id: string
  source: PriceSource
  series_start: boolean
  recorded_at: Date
}

const toPriceRow = (row: Record<string, unknown>): PriceRecordRow => ({
  id: String(row.id),
  variant_id: String(row.variant_id),
  product_id: String(row.product_id),
  region_id: String(row.region_id),
  currency_code: String(row.currency_code),
  amount: toAmount(row.amount) ?? 0,
  regular_amount: toAmount(row.regular_amount) ?? 0,
  discounted: Boolean(row.discounted),
  discount_kind: (row.discount_kind as DiscountKind) ?? null,
  discount_ref: (row.discount_ref as string) ?? null,
  source: row.source as PriceSource,
  series_start: Boolean(row.series_start),
  start_known: Boolean(row.start_known),
  recorded_at: new Date(row.recorded_at as string),
})

export const toPoint = (row: PriceRecordRow): PricePoint => ({
  at: row.recorded_at,
  amount: row.amount,
  regular: row.regular_amount,
  discounted: row.discounted,
  kind: row.discount_kind,
  ref: row.discount_ref,
})

const ANONYMIZED_CACHE_MS = 60_000

/** Anonymised customer ids, cached per server process. */
let anonymizedCache: { ids: Set<string>; at: number } | null = null

/** `in (?, ?, …)` with one placeholder per value (the driver expands arrays itself). */
const inList = (values: unknown[]) => `(${values.map(() => "?").join(", ")})`

class ComplianceModuleService extends MedusaService({
  ComplianceManufacturer,
  ComplianceProductSafety,
  ComplianceConsentType,
  ComplianceConsentVersion,
  ComplianceConsentEntry,
  ComplianceRequest,
  ComplianceRequestEvent,
  CompliancePriceRecord,
  ComplianceSetting,
  ComplianceAnonymization,
  ComplianceOrderRetention,
}) {
  protected state_: { options: CompliancePluginOptions } | { disabled: string }

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

  async getOptions(): Promise<CompliancePluginOptions> {
    return "options" in this.state_
      ? this.state_.options
      : { timeZone: "Europe/Warsaw", defaultLocale: "pl", dataProviders: [], demo: false }
  }

  /* Settings ---------------------------------------------------------------- */

  async getSettings(): Promise<ComplianceSettings> {
    return readSettings(await this.getValue(SETTINGS_KEY))
  }

  async saveSettings(value: unknown): Promise<ComplianceSettings> {
    const settings = settingsSchema.parse(value)
    await this.setValue(SETTINGS_KEY, settings as unknown as Record<string, unknown>)
    return settings
  }

  async getValue(key: string): Promise<unknown> {
    const [row] = await this.listComplianceSettings({ key })
    return row?.value ?? null
  }

  async setValue(key: string, value: Record<string, unknown>): Promise<void> {
    const [row] = await this.listComplianceSettings({ key })
    // A JSON column update merges objects, so replace the row instead.
    if (row) await this.deleteComplianceSettings(row.id)
    await this.createComplianceSettings({ key, value })
  }

  /** A random salt for hashing IP addresses, created once per store. */
  async ipSalt(): Promise<string> {
    const stored = (await this.getValue(IP_SALT_KEY)) as { salt?: string } | null
    if (stored?.salt) return stored.salt
    const salt = randomBytes(16).toString("hex")
    await this.setValue(IP_SALT_KEY, { salt })
    return salt
  }

  async omnibusStartedAt(): Promise<Date | null> {
    const stored = (await this.getValue(OMNIBUS_STARTED_KEY)) as { at?: string } | null
    return stored?.at ? new Date(stored.at) : null
  }

  /* Omnibus ------------------------------------------------------------------ */

  /** The newest record of every series of the given variants (all when omitted). */
  @InjectManager()
  async latestPrices(variantIds?: string[], @MedusaContext() context: Context = {}): Promise<PriceRecordRow[]> {
    const manager = context.manager as unknown as SqlManager
    if (variantIds && !variantIds.length) return []
    const filter = variantIds ? `and "variant_id" in ${inList(variantIds)}` : ""
    const rows = await manager.execute(
      `select distinct on ("variant_id", "region_id", "currency_code") * from "compliance_price_record" ` +
        `where "deleted_at" is null ${filter} ` +
        `order by "variant_id", "region_id", "currency_code", "recorded_at" desc, "created_at" desc`,
      variantIds ?? []
    )
    return rows.map(toPriceRow)
  }

  /** Full history of the given variants, oldest first. */
  @InjectManager()
  async priceHistory(
    variantIds: string[],
    filters: { region_id?: string; since?: Date } = {},
    @MedusaContext() context: Context = {}
  ): Promise<PriceRecordRow[]> {
    if (!variantIds.length) return []
    const manager = context.manager as unknown as SqlManager
    const params: unknown[] = [...variantIds]
    let where = `"variant_id" in ${inList(variantIds)}`
    if (filters.region_id) {
      where += ` and "region_id" = ?`
      params.push(filters.region_id)
    }
    if (filters.since) {
      where += ` and "recorded_at" >= ?`
      params.push(filters.since)
    }
    const rows = await manager.execute(
      `select * from "compliance_price_record" where "deleted_at" is null and ${where} order by "recorded_at" asc, "created_at" asc`,
      params
    )
    return rows.map(toPriceRow)
  }

  /**
   * Appends the observations that differ from the last record of their
   * series. A transaction-level lock keeps two observers (an event and the
   * hourly job) from recording the same change twice.
   */
  @InjectManager()
  async recordPrices(
    observations: PriceObservation[],
    options: { source: PriceSource; at?: Date },
    @MedusaContext() context: Context = {}
  ): Promise<PriceRecordRow[]> {
    if (!observations.length) return []
    return await this.recordPrices_(observations, options, context)
  }

  @InjectTransactionManager()
  protected async recordPrices_(
    observations: PriceObservation[],
    options: { source: PriceSource; at?: Date },
    @MedusaContext() context: Context = {}
  ): Promise<PriceRecordRow[]> {
    const manager = context.transactionManager as unknown as SqlManager
    await manager.execute(`select pg_advisory_xact_lock(hashtext('compliance_price_record'))`)
    const variantIds = [...new Set(observations.map((o) => o.variant_id))]
    const latestRows = await manager.execute(
      `select distinct on ("variant_id", "region_id", "currency_code") * from "compliance_price_record" ` +
        `where "deleted_at" is null and "variant_id" in ${inList(variantIds)} ` +
        `order by "variant_id", "region_id", "currency_code", "recorded_at" desc, "created_at" desc`,
      variantIds
    )
    const latest = new Map(
      latestRows.map(toPriceRow).map((row) => [`${row.variant_id}|${row.region_id}|${row.currency_code}`, row])
    )
    const at = options.at ?? new Date()
    const inserted: PriceRecordRow[] = []
    for (const o of observations) {
      const key = `${o.variant_id}|${o.region_id}|${o.currency_code}`
      const last = latest.get(key)
      const next = {
        amount: o.amount,
        regular: o.regular_amount,
        discounted: o.discounted,
        kind: o.discount_kind,
        ref: o.discount_ref,
      }
      if (!priceChanged(last ? toPoint(last) : null, next)) continue
      const id = generateEntityId(undefined, "cpr")
      const seriesStart = !last
      const [row] = await manager.execute(
        `insert into "compliance_price_record" ("id", "variant_id", "product_id", "region_id", "currency_code", "amount", "raw_amount", ` +
          `"regular_amount", "raw_regular_amount", "discounted", "discount_kind", "discount_ref", "source", "series_start", "start_known", ` +
          `"recorded_at", "created_at", "updated_at") values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now()) returning *`,
        [
          id,
          o.variant_id,
          o.product_id,
          o.region_id,
          o.currency_code,
          o.amount,
          JSON.stringify({ value: String(o.amount), precision: 20 }),
          o.regular_amount,
          JSON.stringify({ value: String(o.regular_amount), precision: 20 }),
          o.discounted,
          o.discount_kind,
          o.discount_ref,
          seriesStart ? (o.start_known ? options.source : "snapshot") : options.source,
          seriesStart,
          seriesStart ? o.start_known : false,
          at,
        ]
      )
      const record = toPriceRow(row)
      latest.set(key, record)
      inserted.push(record)
    }
    return inserted
  }

  /** Series whose newest record is a discount. */
  @InjectManager()
  async discountedSeries(@MedusaContext() context: Context = {}): Promise<PriceRecordRow[]> {
    return (await this.latestPrices(undefined, context)).filter((row) => row.discounted)
  }

  /** First record of each series of the given variants: where its history begins. */
  @InjectManager()
  async seriesStarts(variantIds: string[], @MedusaContext() context: Context = {}): Promise<PriceRecordRow[]> {
    if (!variantIds.length) return []
    const manager = context.manager as unknown as SqlManager
    const rows = await manager.execute(
      `select * from "compliance_price_record" where "deleted_at" is null and "series_start" = true and "variant_id" in ${inList(variantIds)}`,
      variantIds
    )
    return rows.map(toPriceRow)
  }

  /* Requests ----------------------------------------------------------------- */

  /**
   * Moves a request to a new status only if it is still in one of `from`,
   * so two people clicking at once cannot both act on it.
   */
  @InjectManager()
  async transitionRequest(
    id: string,
    from: RequestStatus[],
    patch: Partial<{
      status: RequestStatus
      verified_at: Date
      deadline_at: Date
      closed_at: Date
      reminded_at: Date
      token_hash: string | null
      token_expires_at: Date | null
    }>,
    @MedusaContext() context: Context = {}
  ): Promise<Record<string, unknown> | null> {
    const manager = context.manager as unknown as SqlManager
    const fields = Object.keys(patch)
    if (!fields.length) return null
    const sets = fields.map((field) => `"${field}" = ?`).join(", ")
    const values = fields.map((field) => (patch as Record<string, unknown>)[field])
    const rows = await manager.execute(
      `update "compliance_request" set ${sets}, "updated_at" = now() where "id" = ? and "status" in ${inList(from)} and "deleted_at" is null returning *`,
      [...values, id, ...from]
    )
    return rows[0] ?? null
  }

  /* Anonymised customers ----------------------------------------------------- */

  /** Whether a customer was anonymised; cached for a minute per server. */
  async isAnonymized(customerId: string): Promise<boolean> {
    const now = Date.now()
    let cache = anonymizedCache
    if (!cache || now - cache.at > ANONYMIZED_CACHE_MS) {
      const rows = await this.listComplianceAnonymizations({}, { select: ["customer_id"] })
      cache = { ids: new Set(rows.map((r) => r.customer_id)), at: now }
      anonymizedCache = cache
    }
    return cache.ids.has(customerId)
  }

  /** Called right after an anonymisation so this server refuses the customer at once. */
  async markAnonymized(customerId: string): Promise<void> {
    anonymizedCache?.ids.add(customerId)
  }
}

export default ComplianceModuleService
