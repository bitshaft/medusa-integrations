import type { ApaczkaPoint } from "../client"
import { clusterGrid, groupIntoClusters, type PointCluster, type StoredClusterQuery } from "../point-clusters"
import type { PointStorage, PointSyncStatus, StoredPointQuery } from "../point-directory"
import { fromPointRow, normalizeSearch, type PointRow, toPointRow } from "../point-rows"
import { ApaczkaPointStore } from "../point-store"

/**
 * Makes every `ApaczkaPointStore` (the module's and the provider's) keep its
 * lists in one `MemoryPointStore`, for unit tests that build the services
 * without a database. Undo with `jest.restoreAllMocks()`.
 */
export function useMemoryPointStore(): MemoryPointStore {
  const memory = new MemoryPointStore()
  const methods = ["getStatus", "listStatuses", "tryLock", "replace", "finish", "search", "clusters", "find"] as const
  for (const method of methods) {
    jest
      .spyOn(ApaczkaPointStore.prototype, method)
      .mockImplementation(((...args: unknown[]) => (memory[method] as (...a: unknown[]) => unknown)(...args)) as never)
  }
  return memory
}

/**
 * `PointStorage` in memory, for unit tests: the same rows and the same
 * search rules as `ApaczkaPointStore`, without Postgres. The SQL itself is
 * covered by the module integration test.
 */
export class MemoryPointStore implements PointStorage {
  readonly rows: PointRow[] = []
  readonly statusByList = new Map<string, PointSyncStatus>()

  async getStatus(type: string, countryCode: string): Promise<PointSyncStatus | null> {
    const status = this.statusByList.get(`${type}:${countryCode}`)
    return status ? { ...status } : null
  }

  async listStatuses(): Promise<PointSyncStatus[]> {
    return [...this.statusByList.values()].map((status) => ({ ...status }))
  }

  async tryLock(type: string, countryCode: string, now: Date, lockTimeoutMs: number): Promise<boolean> {
    const key = `${type}:${countryCode}`
    const status = this.statusByList.get(key) ?? emptyStatus(type, countryCode)
    const dead = status.started_at && status.started_at.getTime() < now.getTime() - lockTimeoutMs
    if (status.status === "running" && !dead) {
      return false
    }
    this.statusByList.set(key, { ...status, status: "running", started_at: now })
    return true
  }

  async replace(type: string, countryCode: string, points: ApaczkaPoint[], syncedAt: Date): Promise<number> {
    const fresh = points
      .map((point) => toPointRow(point, { type, countryCode, syncedAt }))
      .filter((row): row is PointRow => row !== null)
    const kept = this.rows.filter((row) => !(row.type === type && row.country_code === countryCode))
    this.rows.splice(0, this.rows.length, ...kept, ...fresh)
    return fresh.length
  }

  async finish(
    type: string,
    countryCode: string,
    result: { now: Date; source: string; count: number } | { now: Date; error: string }
  ): Promise<void> {
    const key = `${type}:${countryCode}`
    const status = this.statusByList.get(key) ?? emptyStatus(type, countryCode)
    this.statusByList.set(
      key,
      "error" in result
        ? { ...status, status: "failed", finished_at: result.now, error: result.error }
        : {
            ...status,
            status: "idle",
            finished_at: result.now,
            succeeded_at: result.now,
            source: result.source,
            point_count: result.count,
            error: null,
          }
    )
  }

  async search(query: StoredPointQuery): Promise<ApaczkaPoint[]> {
    let rows = this.rows.filter(
      (row) =>
        row.type === query.type &&
        row.country_code === query.countryCode &&
        (!query.cod || row.accepts_cod) &&
        (!query.sending || row.accepts_sending) &&
        query.terms.every((term) => row.search.includes(term)) &&
        (!query.bbox ||
          (row.latitude !== null &&
            row.longitude !== null &&
            row.latitude >= query.bbox.south &&
            row.latitude <= query.bbox.north &&
            row.longitude >= query.bbox.west &&
            row.longitude <= query.bbox.east))
    )
    if (query.origin) {
      const { latitude, longitude } = query.origin
      const scale = Math.cos((latitude * Math.PI) / 180) ** 2
      const distance = (row: PointRow) =>
        row.latitude === null || row.longitude === null
          ? Infinity
          : (row.latitude - latitude) ** 2 + (row.longitude - longitude) ** 2 * scale
      rows = [...rows].sort((a, b) => distance(a) - distance(b))
    } else {
      // Best matches first, as in `ApaczkaPointStore.search`: code, city, city prefix, postal code prefix.
      const phrase = query.terms.join(" ")
      const rank = (row: PointRow) => {
        if (!phrase) return 0
        const city = normalizeSearch(row.city)
        if (row.external_id.toUpperCase() === phrase.toUpperCase()) return 0
        if (city === phrase) return 1
        if (city.startsWith(phrase)) return 2
        if (row.postal_code.startsWith(phrase)) return 3
        return 4
      }
      rows = [...rows].sort(
        (a, b) =>
          rank(a) - rank(b) ||
          `${a.city} ${a.line1} ${a.external_id}`.localeCompare(`${b.city} ${b.line1} ${b.external_id}`)
      )
    }
    return rows.slice(0, query.limit).map((row) => fromPointRow({ ...row, open_hours: parse(row.open_hours) }))
  }

  async clusters(query: StoredClusterQuery): Promise<PointCluster[]> {
    const grid = clusterGrid(query.bbox, query.zoom)
    const { area } = grid
    const located = this.rows.filter(
      (row) =>
        row.type === query.type &&
        row.country_code === query.countryCode &&
        (!query.cod || row.accepts_cod) &&
        (!query.sending || row.accepts_sending) &&
        row.latitude !== null &&
        row.longitude !== null &&
        row.latitude >= area.south &&
        row.latitude <= area.north &&
        row.longitude >= area.west &&
        row.longitude <= area.east
    )
    return groupIntoClusters(
      located.map((row) => ({ id: row.external_id, latitude: row.latitude!, longitude: row.longitude! })),
      grid
    )
  }

  async find(type: string, countryCode: string, pointId: string): Promise<ApaczkaPoint | undefined> {
    const id = pointId.trim().toUpperCase()
    const row = this.rows.find(
      (candidate) =>
        candidate.type === type &&
        candidate.country_code === countryCode &&
        (candidate.external_id.toUpperCase() === id || candidate.name?.toUpperCase() === id)
    )
    return row ? fromPointRow({ ...row, open_hours: parse(row.open_hours) }) : undefined
  }
}

function emptyStatus(type: string, countryCode: string): PointSyncStatus {
  return {
    type,
    country_code: countryCode,
    source: null,
    status: "idle",
    started_at: null,
    finished_at: null,
    succeeded_at: null,
    point_count: null,
    error: null,
  }
}

/** Postgres returns the parsed JSON; the row holds the text written. */
function parse(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value
}
