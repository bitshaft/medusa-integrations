import type { Logger } from "@medusajs/framework/types"
import { MedusaService } from "@medusajs/framework/utils"

import { logPluginDisabled, pluginDisabledError } from "../../lib/currency/kit/options"
import { type CurrencyPluginOptions, parseOptions, PLUGIN_NAME } from "../../lib/currency/options"
import type { RateStore, RateTable } from "../../lib/currency/rates"
import { readSettings, type Settings, SETTINGS_KEY } from "../../lib/currency/settings"
import { CurrencyFillRun } from "./models/fill-run"
import { CurrencyFilledPrice } from "./models/filled-price"
import { CurrencyRateTable } from "./models/rate-table"
import { CurrencySetting } from "./models/setting"

type InjectedDependencies = { logger: Logger }

export type FilledRecord = {
  price_id: string
  run_id: string
  amount: string
  rate: string
  table_no: string | null
  rate_date: string | null
  mode: string
  margin: string
  created_at: Date
}

/**
 * The plugin's own module: settings, saved rate tables, and the history of
 * fills with every price written.
 */
export default class CurrencyModuleService
  extends MedusaService({ CurrencySetting, CurrencyRateTable, CurrencyFillRun, CurrencyFilledPrice })
  implements RateStore
{
  protected readonly logger_: Logger
  private readonly state_: { options: CurrencyPluginOptions } | { disabled: string }

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

  async getOptions(): Promise<CurrencyPluginOptions> {
    if ("disabled" in this.state_) {
      throw pluginDisabledError(PLUGIN_NAME, this.state_.disabled)
    }
    return this.state_.options
  }

  /* Settings ---------------------------------------------------------------- */

  async getSettings(): Promise<Settings> {
    const [row] = await this.listCurrencySettings({ key: SETTINGS_KEY }, { take: 1 })
    return readSettings(row?.value)
  }

  async saveSettings(value: Settings): Promise<void> {
    const [row] = await this.listCurrencySettings({ key: SETTINGS_KEY }, { take: 1 })
    const json = value as unknown as Record<string, unknown>
    if (row) {
      await this.updateCurrencySettings({ id: row.id, value: json })
    } else {
      await this.createCurrencySettings({ key: SETTINGS_KEY, value: json })
    }
  }

  /* Rate tables (RateStore) ------------------------------------------------- */

  async latestTable(provider: string): Promise<{ table: RateTable; checked_at: Date } | null> {
    const [row] = await this.listCurrencyRateTables({ provider }, { take: 1, order: { effective_date: "DESC" } })
    if (!row) return null
    return {
      table: {
        provider: row.provider,
        table: row.table_no,
        date: row.effective_date,
        base: row.base,
        rates: row.rates as Record<string, string>,
      },
      checked_at: new Date(row.checked_at as unknown as string),
    }
  }

  async saveTable(table: RateTable, checkedAt: Date): Promise<void> {
    const [row] = await this.listCurrencyRateTables(
      { provider: table.provider, effective_date: table.date },
      { take: 1 }
    )
    const data = {
      table_no: table.table,
      base: table.base,
      rates: table.rates as unknown as Record<string, unknown>,
      checked_at: checkedAt,
    }
    if (row) {
      await this.updateCurrencyRateTables({ id: row.id, ...data })
    } else {
      await this.createCurrencyRateTables({ provider: table.provider, effective_date: table.date, ...data })
    }
  }

  /* History ----------------------------------------------------------------- */

  /** The newest fill record of each price, for telling filled prices from manual ones. */
  async filledFor(priceIds: string[]): Promise<Record<string, FilledRecord>> {
    const out: Record<string, FilledRecord> = {}
    for (let i = 0; i < priceIds.length; i += 500) {
      const rows = await this.listCurrencyFilledPrices(
        { price_id: priceIds.slice(i, i + 500) },
        { order: { created_at: "ASC" } }
      )
      for (const row of rows) {
        out[row.price_id] = {
          price_id: row.price_id,
          run_id: row.run_id,
          amount: row.amount,
          rate: row.rate,
          table_no: row.table_no ?? null,
          rate_date: row.rate_date ?? null,
          mode: row.mode,
          margin: row.margin,
          created_at: new Date(row.created_at as unknown as string),
        }
      }
    }
    return out
  }
}
