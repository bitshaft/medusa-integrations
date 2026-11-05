import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { ApaczkaApiError } from "../lib/apaczka"
import { ShipmentStatus, TERMINAL_STATUSES } from "../lib/apaczka/statuses"
import { APACZKA_MODULE } from "../modules/apaczka"
import type ApaczkaModuleService from "../modules/apaczka/service"
import { pollShipmentTracking } from "../workflows/helpers/poll-tracking"

const BATCH_SIZE = 200
const CONCURRENCY = 4
/** Skip shipments synced more recently than this. */
const MIN_INTERVAL_MS = 25 * 60_000
/** Stop polling shipments that have not finished after this long. */
const MAX_AGE_MS = 60 * 24 * 60 * 60_000

/**
 * Backup for push tracking: polls `tracking/` for active shipments every
 * 30 minutes. Disable with `tracking.polling: false`.
 *
 * Note: `tracking/` is not available on the Apaczka sandbox.
 */
export default async function apaczkaSyncTracking(container: MedusaContainer) {
  const apaczka = container.resolve<ApaczkaModuleService>(APACZKA_MODULE)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!apaczka.getOptions().tracking.polling) {
    return
  }

  const now = Date.now()
  const active = Object.values(ShipmentStatus).filter(
    (status) => !TERMINAL_STATUSES.has(status) && status !== ShipmentStatus.PENDING
  )

  const shipments = await apaczka.listApaczkaShipments(
    { status: active, created_at: { $gte: new Date(now - MAX_AGE_MS) } },
    { order: { last_synced_at: "ASC" }, take: BATCH_SIZE, select: ["id", "waybill_number", "last_synced_at"] }
  )

  const due = shipments.filter(
    (s) => s.waybill_number && (!s.last_synced_at || now - new Date(s.last_synced_at).getTime() > MIN_INTERVAL_MS)
  )
  if (!due.length) {
    return
  }

  let changed = 0
  let failed = 0
  const queue = [...due]
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let shipment = queue.shift(); shipment; shipment = queue.shift()) {
        try {
          const result = await pollShipmentTracking(container, shipment.id)
          if (result.changed) {
            changed++
          }
        } catch (error) {
          failed++
          const message = error instanceof ApaczkaApiError ? `${error.message} (status ${error.status})` : (error as Error).message
          logger.warn(`[apaczka] Tracking poll failed for shipment ${shipment.id}: ${message}`)
        }
      }
    })
  )

  logger.info(`[apaczka] Polled ${due.length} shipments: ${changed} changed, ${failed} failed`)
}

export const config = {
  name: "apaczka-sync-tracking",
  schedule: "*/30 * * * *",
}
