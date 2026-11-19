import type { Logger } from "@medusajs/framework/types"

import { buildUserAgent } from "../kit/package-info"
import { dec, effectiveRate, rateString, type ResolvedRate } from "../money"
import type { CurrencyPluginOptions, ProviderId } from "../options"
import type { CurrencyRule } from "../settings"
import { NbpRateProvider } from "./nbp"
import { type RateProvider, RateSourceError, type RateTable } from "./types"

export { type RateProvider, RateSourceError, type RateTable } from "./types"

/** Every rate source by id. Adding one (e.g. the ECB) means adding it here and to `PROVIDERS`. */
const FACTORIES: Record<
  ProviderId,
  (options: CurrencyPluginOptions, logger?: Logger, version?: string) => RateProvider
> = {
  nbp: (options, logger, version) =>
    new NbpRateProvider({
      baseUrl: options.nbp.baseUrl,
      timeoutMs: options.nbp.timeoutMs,
      logger,
      userAgent: buildUserAgent("medusa-plugin-currency", version ?? "0"),
    }),
}

export function createRateProvider(options: CurrencyPluginOptions, logger?: Logger, version?: string): RateProvider {
  return FACTORIES[options.provider](options, logger, version)
}

/** Where tables are kept between requests (the plugin's module). */
export interface RateStore {
  /** The newest saved table of a source, with when it was last confirmed as the newest. */
  latestTable(provider: string): Promise<{ table: RateTable; checked_at: Date } | null>
  /** Saves a table (once per source and day) and marks it confirmed now. */
  saveTable(table: RateTable, checkedAt: Date): Promise<void>
}

export type RateStatus = "fresh" | "stale" | "unavailable" | "demo"

export type RateLookup = {
  table: RateTable | null
  /**
   * `fresh`: the newest table. `stale`: the source did not answer and a
   * newer table is due; `table` is the last saved one, to be used only on
   * request. `unavailable`: no answer and nothing saved.
   */
  status: RateStatus
  /** When the source last confirmed this table as its newest. */
  checked_at: string | null
  /** When a newer table can be expected. */
  next_expected: string | null
  /** Why the source could not be used (no secrets, no values). */
  error: string | null
}

/** After a failed or empty check, ask again no sooner than this (holidays publish nothing). */
const RECHECK_MS = 30 * 60_000

/**
 * The current table: the saved one until a newer one is due, then the
 * source's. When the source fails, the saved table comes back as `stale`.
 */
export async function lookupRates(input: {
  provider: RateProvider
  store: RateStore
  now?: Date
  /** Ask the source even when the saved table is current. */
  refresh?: boolean
}): Promise<RateLookup> {
  const now = input.now ?? new Date()
  const saved = await input.store.latestTable(input.provider.id)
  const describe = (
    table: RateTable,
    checkedAt: Date,
    status: RateStatus,
    error: string | null = null
  ): RateLookup => ({
    table,
    status,
    checked_at: checkedAt.toISOString(),
    next_expected: input.provider.nextExpected(table).toISOString(),
    error,
  })

  if (saved && !input.refresh) {
    const due = input.provider.nextExpected(saved.table)
    const recentlyChecked = now.getTime() - saved.checked_at.getTime() < RECHECK_MS
    if (now < due || recentlyChecked) {
      return describe(saved.table, saved.checked_at, "fresh")
    }
  }

  try {
    const table = await input.provider.latest()
    await input.store.saveTable(table, now)
    return describe(table, now, "fresh")
  } catch (error) {
    const message = error instanceof RateSourceError ? error.message : `Rate source failed: ${(error as Error).message}`
    if (!saved) {
      return { table: null, status: "unavailable", checked_at: null, next_expected: null, error: message }
    }
    // The saved table is still the newest one when no newer one is due yet.
    const due = input.provider.nextExpected(saved.table)
    return describe(saved.table, saved.checked_at, now < due ? "fresh" : "stale", message)
  }
}

/**
 * How much of `base` one unit of `target` is worth, from one table quoted in
 * a third currency: `rate(target) / rate(base)`, where the table's own
 * currency counts as 1. Null when the table lacks either currency.
 */
export function crossRate(table: RateTable, base: string, target: string): string | null {
  const quote = (code: string) => (code.toUpperCase() === table.base ? "1" : table.rates[code.toUpperCase()])
  const baseRate = quote(base)
  const targetRate = quote(target)
  if (!baseRate || !targetRate) return null
  return rateString(dec(targetRate).div(dec(baseRate)))
}

export type RateProblem = "rates_unavailable" | "rate_missing" | "fixed_rate_missing"

/**
 * One currency's rate under its rule. A stale table is used only when the
 * admin chose to (`allowStale`), and is then marked as such.
 */
export function resolveRate(input: {
  base: string
  target: string
  rule: CurrencyRule
  lookup: RateLookup
  allowStale: boolean
}): { ok: true; rate: ResolvedRate } | { ok: false; reason: RateProblem } {
  const { rule, lookup } = input
  const currency = input.target.toLowerCase()
  if (rule.mode === "fixed") {
    if (!rule.fixedRate) return { ok: false, reason: "fixed_rate_missing" }
    const rate = rateString(dec(rule.fixedRate))
    return { ok: true, rate: { currency, mode: "fixed", rate, margin: "0", effective: rate, source: null } }
  }
  const usable = lookup.table && (lookup.status !== "stale" || input.allowStale)
  if (!usable || !lookup.table) return { ok: false, reason: "rates_unavailable" }
  const rate = crossRate(lookup.table, input.base, input.target)
  if (!rate) return { ok: false, reason: "rate_missing" }
  const margin = rule.mode === "api_margin" ? rateString(dec(rule.marginPercent)) : "0"
  return {
    ok: true,
    rate: {
      currency,
      mode: rule.mode,
      rate,
      margin,
      effective: effectiveRate(rate, margin),
      source: {
        provider: lookup.table.provider,
        table: lookup.table.table,
        date: lookup.table.date,
        stale: lookup.status === "stale",
      },
    },
  }
}
