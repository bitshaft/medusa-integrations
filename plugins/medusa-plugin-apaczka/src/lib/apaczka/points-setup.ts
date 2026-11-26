import type { Knex } from "@medusajs/framework/mikro-orm/knex"

import type { ApaczkaClient, ApaczkaLogger } from "./client"
import { pointSource } from "./client-factory"
import type { ApaczkaPluginOptions } from "./options"
import { ApaczkaPointDirectory } from "./point-directory"
import { ApaczkaPointStore } from "./point-store"

/**
 * The point directory for the module or the fulfillment provider: stored
 * lists in the shared database, refreshed from `client`. Both read the same
 * tables, so only one copy of each list exists.
 *
 * `connection` is resolved on first use, so building a provider or module
 * without a database (tests, disabled mode) never fails.
 */
export function createPointDirectory(
  client: ApaczkaClient,
  options: ApaczkaPluginOptions,
  logger: ApaczkaLogger | undefined,
  connection: () => Knex | undefined
): ApaczkaPointDirectory {
  const safeConnection = () => {
    try {
      return connection()
    } catch {
      return undefined
    }
  }
  return new ApaczkaPointDirectory(client, new ApaczkaPointStore(safeConnection), {
    source: pointSource(options),
    refreshAfterMs: options.pointsTtlMinutes * 60_000,
    logger,
  })
}
