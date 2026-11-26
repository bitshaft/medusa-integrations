import type { Logger } from "@medusajs/framework/types"

import { ApaczkaClient, DemoApaczkaClient } from "./client"
import type { ApaczkaPluginOptions } from "./options"
import { userAgent } from "./version"

/**
 * The Apaczka client for the options: the demo client in demo mode, the real
 * one otherwise. With `demo` and `livePoints`, the demo client gets the real
 * parcel points request only.
 */
export function createApaczkaClient(options: ApaczkaPluginOptions, logger?: Logger): ApaczkaClient {
  if (!options.demo) {
    return realClient(options, logger)
  }
  if (!options.livePoints) {
    return new DemoApaczkaClient()
  }
  const real = realClient(options, logger)
  // Only this function can reach the real client: no object holds it.
  return new DemoApaczkaClient({ livePoints: (type, payload, signal) => real.getPoints(type, payload, signal) })
}

/**
 * The options the module and the fulfillment provider keep once the client
 * is built. In demo mode the keys are placeholders again: with `livePoints`
 * the real ones stay inside the client's points request, so routes,
 * workflows, the webhook check and anything that logs the options never see
 * them. (A demo store also rejects real Apaczka webhooks this way.)
 */
export function withoutDemoCredentials(options: ApaczkaPluginOptions): ApaczkaPluginOptions {
  return options.demo ? { ...options, appId: "demo", appSecret: "demo" } : options
}

function realClient(options: ApaczkaPluginOptions, logger?: Logger): ApaczkaClient {
  return new ApaczkaClient({
    appId: options.appId,
    appSecret: options.appSecret,
    environment: options.environment,
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    userAgent: userAgent(),
    logger,
  })
}

/**
 * Where the stored parcel points come from. A stored list from another
 * source (e.g. the demo samples before `livePoints` was switched on) is
 * replaced before it is used.
 */
export function pointSource(options: ApaczkaPluginOptions): string {
  if (options.demo && !options.livePoints) {
    return "demo"
  }
  return options.baseUrl ? `custom:${options.baseUrl}` : options.environment
}
