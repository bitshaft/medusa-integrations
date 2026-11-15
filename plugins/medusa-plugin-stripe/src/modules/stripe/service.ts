import type { Logger } from "@medusajs/framework/types"

import { ResponseCache } from "../../lib/stripe/cache"
import { StripeReadClient } from "../../lib/stripe/client"
import { describeKey, type KeyInfo } from "../../lib/stripe/key"
import { logPluginDisabled } from "../../lib/stripe/kit/options"
import { parseOptions, PLUGIN_NAME, type StripePluginOptions } from "../../lib/stripe/options"
import { StripeReader } from "../../lib/stripe/reader"

type InjectedDependencies = { logger: Logger }

/**
 * Holds the options, the read-only client and the response cache. No data
 * models: the plugin stores nothing about payments, everything is read from
 * Stripe on demand.
 */
export default class StripeModuleService {
  protected readonly state_: { options: StripePluginOptions } | { disabled: string }
  protected readonly reader_: StripeReader | null
  protected readonly cache_: ResponseCache

  constructor({ logger }: InjectedDependencies, options: Record<string, unknown> = {}) {
    const parsed = parseOptions(options)
    if (!parsed.enabled) {
      logPluginDisabled(logger, PLUGIN_NAME, parsed.reason)
      this.state_ = { disabled: parsed.reason }
      this.cache_ = new ResponseCache(0)
      this.reader_ = null
      return
    }
    this.state_ = { options: parsed.options }
    this.cache_ = new ResponseCache(parsed.options.cacheSeconds * 1000)
    // Demo mode never creates a client, so no request can reach Stripe.
    this.reader_ =
      parsed.options.demo || !parsed.options.apiKey
        ? null
        : new StripeReader(new StripeReadClient({ apiKey: parsed.options.apiKey, logger }), this.cache_)
  }

  isEnabled(): boolean {
    return "options" in this.state_
  }

  disabledReason(): string | null {
    return "disabled" in this.state_ ? this.state_.disabled : null
  }

  /** Options without the key. */
  getOptions(): Omit<StripePluginOptions, "apiKey"> & { hasKey: boolean } {
    const base: StripePluginOptions =
      "options" in this.state_
        ? this.state_.options
        : {
            demo: false,
            providerId: "stripe",
            backendUrl: undefined,
            storefrontDomains: [],
            cacheSeconds: 300,
            mode: undefined,
            orphanGraceMinutes: 30,
            apiKey: undefined,
          }
    const { apiKey, ...rest } = base
    return { ...rest, hasKey: Boolean(apiKey) }
  }

  isDemo(): boolean {
    return "options" in this.state_ && this.state_.options.demo
  }

  keyInfo(): KeyInfo | null {
    return "options" in this.state_ ? describeKey(this.state_.options.apiKey) : null
  }

  /** The reader, or null in demo mode and without a key. */
  reader(): StripeReader | null {
    return this.reader_
  }

  /** Forgets cached answers that mention `fragment` (e.g. a PaymentIntent id), or all of them. */
  invalidate(fragment?: string): number {
    return this.cache_.invalidate(fragment)
  }
}
