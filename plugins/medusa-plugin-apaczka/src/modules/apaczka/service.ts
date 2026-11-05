import { createHash } from "node:crypto"

import type { Logger } from "@medusajs/framework/types"
import { MedusaService } from "@medusajs/framework/utils"

import { ApaczkaClient } from "../../lib/apaczka"
import type { ShipmentStatus } from "../../lib/apaczka/statuses"
import { ApaczkaCatalog } from "../../lib/catalog"
import { type ApaczkaPluginOptions, resolveOptions } from "../../lib/options"
import { userAgent } from "../../lib/version"
import { ApaczkaShipment } from "./models/shipment"
import { ApaczkaTrackingEvent } from "./models/tracking-event"

type InjectedDependencies = { logger: Logger }

export type TrackingEventInput = {
  source: "webhook" | "polling" | "system"
  status: ShipmentStatus
  raw_status: string
  description?: string | null
  place?: string | null
  occurred_at: Date
}

/**
 * The plugin's own module: shipment records, tracking history, and the
 * Apaczka client used by workflows, API routes and jobs.
 */
export default class ApaczkaModuleService extends MedusaService({
  ApaczkaShipment,
  ApaczkaTrackingEvent,
}) {
  protected readonly logger_: Logger
  protected readonly options_: ApaczkaPluginOptions
  protected readonly client_: ApaczkaClient
  protected readonly catalog_: ApaczkaCatalog

  constructor(container: InjectedDependencies, options: Record<string, unknown>) {
    super(...arguments)
    this.logger_ = container.logger
    this.options_ = resolveOptions(options)
    this.client_ = new ApaczkaClient({
      appId: this.options_.appId,
      appSecret: this.options_.appSecret,
      environment: this.options_.environment,
      baseUrl: this.options_.baseUrl,
      timeoutMs: this.options_.timeoutMs,
      maxRetries: this.options_.maxRetries,
      userAgent: userAgent(),
      logger: container.logger,
    })
    this.catalog_ = new ApaczkaCatalog(this.client_, {
      serviceStructureTtlMs: this.options_.serviceStructureTtlMinutes * 60_000,
      pointsTtlMs: this.options_.pointsTtlMinutes * 60_000,
      logger: container.logger,
    })
  }

  async getClient(): Promise<ApaczkaClient> {
    return this.client_
  }

  async getCatalog(): Promise<ApaczkaCatalog> {
    return this.catalog_
  }

  async getOptions(): Promise<ApaczkaPluginOptions> {
    return this.options_
  }

  /**
   * Stores tracking events that are not stored yet and returns only the new
   * ones. Safe to call repeatedly with overlapping data.
   */
  async recordTrackingEvents(shipmentId: string, events: TrackingEventInput[]) {
    if (!events.length) {
      return []
    }

    const withFingerprint = events.map((event) => ({
      ...event,
      fingerprint: fingerprint(event),
    }))

    const existing = await this.listApaczkaTrackingEvents(
      { shipment_id: shipmentId, fingerprint: withFingerprint.map((e) => e.fingerprint) },
      { select: ["fingerprint"] }
    )
    const known = new Set(existing.map((e) => e.fingerprint))

    const seen = new Set<string>()
    const fresh = withFingerprint.filter((event) => {
      if (known.has(event.fingerprint) || seen.has(event.fingerprint)) {
        return false
      }
      seen.add(event.fingerprint)
      return true
    })

    if (!fresh.length) {
      return []
    }

    return this.createApaczkaTrackingEvents(
      fresh.map((event) => ({
        source: event.source,
        status: event.status,
        raw_status: event.raw_status,
        description: event.description ?? null,
        place: event.place ?? null,
        occurred_at: event.occurred_at,
        fingerprint: event.fingerprint,
        shipment_id: shipmentId,
      }))
    )
  }
}

function fingerprint(event: TrackingEventInput): string {
  return createHash("sha256")
    .update([event.source, event.raw_status, event.occurred_at.toISOString(), event.description ?? ""].join("|"))
    .digest("hex")
    .slice(0, 32)
}
