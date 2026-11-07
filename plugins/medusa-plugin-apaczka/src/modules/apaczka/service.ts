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
      pointCountries: this.options_.pointCountries,
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
   *
   * Webhooks and polling report the same change in different vocabularies,
   * so an event is also skipped when the other source already recorded the
   * same status within a few minutes (see `selectNewEvents`).
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
      { shipment_id: shipmentId },
      { select: ["fingerprint", "source", "status", "occurred_at"] }
    )

    const fresh = selectNewEvents(
      withFingerprint,
      existing.map((e) => ({
        fingerprint: e.fingerprint,
        source: e.source,
        status: e.status as ShipmentStatus,
        occurred_at: new Date(e.occurred_at),
      }))
    )

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

/** Events from different sources within this window are the same change. */
export const CROSS_SOURCE_WINDOW_MS = 15 * 60_000

type EventKey = Pick<TrackingEventInput, "source" | "status" | "occurred_at"> & { fingerprint: string }

/**
 * Returns the candidates worth storing: not already stored (by fingerprint),
 * not repeated within the batch, and not a copy of an event the *other*
 * source already reported (same status, within `CROSS_SOURCE_WINDOW_MS`).
 */
export function selectNewEvents<T extends EventKey>(candidates: T[], existing: EventKey[]): T[] {
  const accepted: EventKey[] = [...existing]
  const fingerprints = new Set(existing.map((e) => e.fingerprint))
  const result: T[] = []

  for (const event of candidates) {
    if (fingerprints.has(event.fingerprint)) {
      continue
    }
    const mirrored = accepted.some(
      (other) =>
        other.source !== event.source &&
        other.status === event.status &&
        Math.abs(other.occurred_at.getTime() - event.occurred_at.getTime()) <= CROSS_SOURCE_WINDOW_MS
    )
    if (mirrored) {
      continue
    }
    fingerprints.add(event.fingerprint)
    accepted.push(event)
    result.push(event)
  }

  return result
}

function fingerprint(event: TrackingEventInput): string {
  return createHash("sha256")
    .update([event.source, event.raw_status, event.occurred_at.toISOString(), event.description ?? ""].join("|"))
    .digest("hex")
    .slice(0, 32)
}
