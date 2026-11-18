import type { Logger } from "@medusajs/framework/types"

import { ApaczkaClient, DemoApaczkaClient } from "./client"
import type { ApaczkaPluginOptions } from "./options"
import { userAgent } from "./version"

/** The Apaczka client for the options: the demo client in demo mode, the real one otherwise. */
export function createApaczkaClient(options: ApaczkaPluginOptions, logger?: Logger): ApaczkaClient {
  if (options.demo) {
    return new DemoApaczkaClient()
  }
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
