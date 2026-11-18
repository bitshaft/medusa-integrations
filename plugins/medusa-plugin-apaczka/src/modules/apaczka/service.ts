import { createHash } from "node:crypto"

import type { Logger } from "@medusajs/framework/types"
import { MedusaService } from "@medusajs/framework/utils"

import type { ApaczkaClient } from "../../lib/apaczka/client"
import { createApaczkaClient } from "../../lib/apaczka/client-factory"
import type { ShipmentStatus } from "../../lib/apaczka/client/statuses"
import { ApaczkaCatalog } from "../../lib/apaczka/catalog"
import { logPluginDisabled, pluginDisabledError } from "../../lib/apaczka/kit/options"
import { type ApaczkaPluginOptions, parseOptions, PLUGIN_NAME } from "../../lib/apaczka/options"
import { type ApaczkaSettings, readSettings, settingsSchema } from "../../lib/apaczka/settings"
import { ApaczkaShipment } from "./models/shipment"
import { ApaczkaSetting } from "./models/setting"
import { ApaczkaTrackingEvent } from "./models/tracking-event"

type InjectedDependencies = { logger: Logger }

type EnabledState = { options: ApaczkaPluginOptions; client: ApaczkaClient; catalog: ApaczkaCatalog }

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
  ApaczkaSetting,
}) {
  protected readonly logger_: Logger
  private readonly state_: EnabledState | { disabled: string }

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

    const client = createApaczkaClient(parsed.options, container.logger)
    const catalog = new ApaczkaCatalog(client, {
      serviceStructureTtlMs: parsed.options.serviceStructureTtlMinutes * 60_000,
      pointsTtlMs: parsed.options.pointsTtlMinutes * 60_000,
      pointCountries: parsed.options.pointCountries,
      logger: container.logger,
    })
    this.state_ = { options: parsed.options, client, catalog }
  }

  /** False when options are missing or invalid; see `getDisabledReason`. */
  async isEnabled(): Promise<boolean> {
    return !("disabled" in this.state_)
  }

  /** Why the plugin is disabled (safe to show: never contains option values). */
  async getDisabledReason(): Promise<string | null> {
    return "disabled" in this.state_ ? this.state_.disabled : null
  }

  async getClient(): Promise<ApaczkaClient> {
    return this.enabled_().client
  }

  async getCatalog(): Promise<ApaczkaCatalog> {
    return this.enabled_().catalog
  }

  /** Settings from the admin's Settings tab, with defaults for anything never saved. */
  async getSettings(): Promise<ApaczkaSettings> {
    const [row] = await this.listApaczkaSettings({ key: "settings" })
    return readSettings(row?.value)
  }

  async saveSettings(value: unknown): Promise<ApaczkaSettings> {
    const settings = settingsSchema.parse(value)
    const [row] = await this.listApaczkaSettings({ key: "settings" })
    // A JSON column update merges objects, so replace the row instead.
    if (row) await this.deleteApaczkaSettings(row.id)
    await this.createApaczkaSettings({ key: "settings", value: settings as unknown as Record<string, unknown> })
    return settings
  }

  async getOptions(): Promise<ApaczkaPluginOptions> {
    return this.enabled_().options
  }

  private enabled_(): EnabledState {
    if ("disabled" in this.state_) {
      throw pluginDisabledError(PLUGIN_NAME, this.state_.disabled)
    }
    return this.state_
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
