import type { Logger } from "@medusajs/framework/types"
import { MedusaService } from "@medusajs/framework/utils"

import { logPluginDisabled, pluginDisabledError } from "../../lib/coupons/kit/options"
import {
  type CouponSettings,
  type CouponsPluginOptions,
  parseOptions,
  PLUGIN_NAME,
  settingsSchema,
} from "../../lib/coupons/options"
import { CouponsCoupon } from "./models/coupon"
import { CouponsSetting } from "./models/setting"

type InjectedDependencies = { logger: Logger }

export const SETTINGS_KEY = "settings"

/** Coupon rows and admin settings. The discounts themselves live in the Promotion Module. */
export default class CouponsModuleService extends MedusaService({ CouponsCoupon, CouponsSetting }) {
  protected readonly state_: { options: CouponsPluginOptions } | { disabled: string }

  constructor(container: InjectedDependencies, options: Record<string, unknown>) {
    super(...arguments)
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

  async disabledReason(): Promise<string | null> {
    return "disabled" in this.state_ ? this.state_.disabled : null
  }

  async getOptions(): Promise<CouponsPluginOptions> {
    if ("disabled" in this.state_) {
      throw pluginDisabledError(PLUGIN_NAME, this.state_.disabled)
    }
    return this.state_.options
  }

  /** The plugin options' settings with the admin's saved changes on top. */
  async getSettings(): Promise<CouponSettings> {
    const options = await this.getOptions()
    const [row] = await this.listCouponsSettings({ key: SETTINGS_KEY })
    const saved = settingsSchema.partial().safeParse(row?.value ?? {})
    return { ...options.settings, ...(saved.success ? stripUndefined(saved.data) : {}) }
  }

  /** Saves the changed settings; `{}` goes back to the plugin options. */
  async saveSettings(changes: Partial<CouponSettings>): Promise<CouponSettings> {
    const [row] = await this.listCouponsSettings({ key: SETTINGS_KEY })
    const value = stripUndefined(changes)
    // Updating a JSON column merges into the stored object, so a key the
    // admin reset would survive. Replace the row instead.
    if (row) await this.deleteCouponsSettings(row.id)
    if (Object.keys(value).length) await this.createCouponsSettings({ key: SETTINGS_KEY, value })
    return this.getSettings()
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>
}
