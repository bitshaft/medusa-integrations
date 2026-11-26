import { MedusaError } from "@medusajs/framework/utils"

import type { ApaczkaClient, ApaczkaLogger, ApaczkaPoint } from "./client"
import type { PointCluster, StoredClusterQuery } from "./point-clusters"

/** The stored state of one carrier's point list (one row of `apaczka_point_sync`). */
export type PointSyncStatus = {
  type: string
  country_code: string
  /** Where the stored list came from (`pointSource`): `demo`, `production`, `sandbox`… */
  source: string | null
  status: "idle" | "running" | "failed"
  started_at: Date | null
  finished_at: Date | null
  succeeded_at: Date | null
  point_count: number | null
  /** Last failure, safe to show (client errors mask the secret). */
  error: string | null
}

export type StoredPointQuery = {
  type: string
  countryCode: string
  /** Normalized search terms (see `normalizeSearch`); every term must match. */
  terms: string[]
  /** Only points inside this map area. */
  bbox?: { west: number; south: number; east: number; north: number }
  /** Nearest first. */
  origin?: { latitude: number; longitude: number }
  cod?: boolean
  sending?: boolean
  limit: number
}

/** Where point lists are kept: the database in Medusa (`ApaczkaPointStore`), a fake in tests. */
export interface PointStorage {
  getStatus(type: string, countryCode: string): Promise<PointSyncStatus | null>
  listStatuses(): Promise<PointSyncStatus[]>
  /** Marks the list as being synced by this process. False when another sync is running. */
  tryLock(type: string, countryCode: string, now: Date, lockTimeoutMs: number): Promise<boolean>
  /** Stores the list (stamped `syncedAt`) and removes points the list no longer has. Returns the count stored. */
  replace(type: string, countryCode: string, points: ApaczkaPoint[], syncedAt: Date): Promise<number>
  finish(
    type: string,
    countryCode: string,
    result: { now: Date; source: string; count: number } | { now: Date; error: string }
  ): Promise<void>
  search(query: StoredPointQuery): Promise<ApaczkaPoint[]>
  /** The points of a map area grouped into grid cells (see `clusterGrid`). */
  clusters(query: StoredClusterQuery): Promise<PointCluster[]>
  find(type: string, countryCode: string, pointId: string): Promise<ApaczkaPoint | undefined>
}

export type PointDirectoryConfig = {
  /** `pointSource(options)`: a stored list from another source is not used. */
  source: string
  /** A stored list older than this is refreshed in the background (`pointsTtlMinutes`). */
  refreshAfterMs: number
  /** After a failed sync, wait this long before trying again. Default 15 minutes. */
  retryAfterMs?: number
  /** A sync still marked running after this long is treated as dead. Default 10 minutes. */
  lockTimeoutMs?: number
  /** How long a search with nothing stored waits for another process's sync. Default 60 s. */
  waitForSyncMs?: number
  /** "Sync now" (`refresh`) is refused this soon after the last attempt finished. Default 5 minutes. */
  manualSyncCooldownMs?: number
  logger?: ApaczkaLogger
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Parcel point lists kept in the database and refreshed from Apaczka.
 *
 * - A search answers from the stored list. When it is older than
 *   `refreshAfterMs`, a refresh starts in the background and the stored list
 *   is used meanwhile, so customers never wait for Apaczka.
 * - Only a carrier with no usable list yet (never synced, or synced from
 *   another source) makes the search wait for the first sync.
 * - One sync per list at a time: callers in this process share it, and the
 *   database lock keeps other processes (the fulfillment provider, other
 *   dynos) from starting a second one.
 * - After a failure the stored list keeps being used, and the next attempt
 *   waits `retryAfterMs`, so an Apaczka outage is not hammered.
 * - Searches never show why a sync failed (the store API is public); the
 *   cause goes to the log and the list's status, which the admin shows.
 */
export class ApaczkaPointDirectory {
  private readonly inFlight = new Map<string, Promise<void>>()

  constructor(
    private readonly client: Pick<ApaczkaClient, "getPoints">,
    private readonly storage: PointStorage,
    private readonly config: PointDirectoryConfig
  ) {}

  async search(query: StoredPointQuery): Promise<ApaczkaPoint[]> {
    await this.ensure(query.type, query.countryCode)
    return this.storage.search(query)
  }

  /** A zoomed-out map's points, grouped: the whole country is a few hundred clusters, not every point. */
  async clusters(query: StoredClusterQuery): Promise<PointCluster[]> {
    await this.ensure(query.type, query.countryCode)
    return this.storage.clusters(query)
  }

  async find(type: string, countryCode: string, pointId: string): Promise<ApaczkaPoint | undefined> {
    await this.ensure(type, countryCode)
    return this.storage.find(type, countryCode, pointId)
  }

  /**
   * Syncs the list now (or joins the running sync) and waits. For the
   * admin's "Sync now", so a failure says why. Refused within
   * `manualSyncCooldownMs` of the last attempt: repeated clicks must not
   * turn into repeated downloads of the whole list.
   */
  async refresh(type: string, countryCode: string): Promise<PointSyncStatus | null> {
    const status = await this.storage.getStatus(type, countryCode)
    const cooldownMs = this.config.manualSyncCooldownMs ?? 5 * 60_000
    // A running sync is joined, not refused.
    if (status?.finished_at && status.status !== "running") {
      const waitMs = status.finished_at.getTime() + cooldownMs - this.now()
      if (waitMs > 0) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `The last sync of ${type} parcel points was less than ${Math.round(cooldownMs / 60_000)} minutes ago. ` +
            `Try again in ${Math.ceil(waitMs / 60_000)} min.`
        )
      }
    }

    try {
      await this.sync(type, countryCode)
    } catch (error) {
      // Client errors never contain the secret.
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Could not sync ${type} parcel points: ${(error as Error).message}`
      )
    }
    if (!this.usable(await this.storage.getStatus(type, countryCode))) {
      await this.waitForOtherSync(type, countryCode)
    }
    return this.storage.getStatus(type, countryCode)
  }

  async statuses(): Promise<PointSyncStatus[]> {
    return this.storage.listStatuses()
  }

  private async ensure(type: string, countryCode: string): Promise<void> {
    const status = await this.storage.getStatus(type, countryCode)
    const now = this.now()

    if (this.usable(status)) {
      const age = now - status!.succeeded_at!.getTime()
      if (age >= this.config.refreshAfterMs && !this.recentlyFailed(status!, now) && status!.status !== "running") {
        // Stale: refresh in the background, answer from the stored list now.
        this.sync(type, countryCode).catch(() => undefined)
      }
      return
    }

    // Nothing usable stored: this search has to wait for a list.
    if (status && this.recentlyFailed(status, now)) {
      throw unavailable(type)
    }
    try {
      await this.sync(type, countryCode)
    } catch {
      // `run` has logged and stored the cause.
      throw unavailable(type)
    }
    if (!this.usable(await this.storage.getStatus(type, countryCode))) {
      await this.waitForOtherSync(type, countryCode)
    }
  }

  /** One sync per list in this process; the database lock covers other processes. */
  private sync(type: string, countryCode: string): Promise<void> {
    const key = `${type}:${countryCode}`
    let run = this.inFlight.get(key)
    if (!run) {
      run = this.run(type, countryCode).finally(() => this.inFlight.delete(key))
      this.inFlight.set(key, run)
    }
    return run
  }

  private async run(type: string, countryCode: string): Promise<void> {
    const startedAt = new Date(this.now())
    if (!(await this.storage.tryLock(type, countryCode, startedAt, this.config.lockTimeoutMs ?? 10 * 60_000))) {
      // Another process is syncing this list.
      return
    }

    try {
      const points = await this.client.getPoints(type, { country_code: countryCode })
      const count = await this.storage.replace(type, countryCode, points, startedAt)
      await this.storage.finish(type, countryCode, { now: new Date(this.now()), source: this.config.source, count })
      const seconds = ((this.now() - startedAt.getTime()) / 1000).toFixed(1)
      this.config.logger?.info?.(`[apaczka] Stored ${count} ${type} parcel points for ${countryCode} in ${seconds} s`)
    } catch (error) {
      const message = (error as Error).message
      await this.storage.finish(type, countryCode, { now: new Date(this.now()), error: message }).catch(() => undefined)
      this.config.logger?.warn(`[apaczka] Could not sync ${type} parcel points for ${countryCode}: ${message}`)
      throw error
    }
  }

  /** Waits for a sync running in another process to store a usable list. */
  private async waitForOtherSync(type: string, countryCode: string): Promise<void> {
    const deadline = this.now() + (this.config.waitForSyncMs ?? 60_000)
    const sleep = this.config.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
    for (;;) {
      const status = await this.storage.getStatus(type, countryCode)
      if (this.usable(status)) {
        return
      }
      if (status?.status === "failed" || this.now() >= deadline) {
        throw unavailable(type)
      }
      await sleep(1000)
    }
  }

  /** A list stored successfully from the configured source. */
  private usable(status: PointSyncStatus | null): boolean {
    return Boolean(status?.succeeded_at && status.source === this.config.source)
  }

  private recentlyFailed(status: PointSyncStatus, now: number): boolean {
    return (
      status.status === "failed" &&
      Boolean(status.finished_at) &&
      now - status.finished_at!.getTime() < (this.config.retryAfterMs ?? 15 * 60_000)
    )
  }

  private now(): number {
    return this.config.now?.() ?? Date.now()
  }
}

/**
 * What a search gets when no list can be used. The store API is public, so
 * it never says why: Apaczka's error would tell anyone the keys don't work.
 */
function unavailable(type: string): MedusaError {
  return new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    `Parcel points for ${type} are not available right now. Try again in a few minutes.`
  )
}
