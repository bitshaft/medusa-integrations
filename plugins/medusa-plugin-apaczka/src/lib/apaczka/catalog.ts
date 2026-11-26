import { MedusaError } from "@medusajs/framework/utils"

import {
  ApaczkaClient,
  type ApaczkaLogger,
  type ApaczkaPoint,
  type ApaczkaService,
  type ApaczkaServiceStructure,
  listServices,
  toArray,
} from "./client"
import type { MapArea, PointCluster } from "./point-clusters"
import type { ApaczkaPointDirectory, PointSyncStatus } from "./point-directory"
import { normalizeSearch } from "./point-rows"

type CacheEntry<T> = { value: T; expiresAt: number }

export type PointSearchQuery = {
  type: string
  countryCode?: string
  /** Free text matched against name/ID, street, city and postal code. */
  query?: string
  latitude?: number
  longitude?: number
  /** Only points inside this map area. */
  bbox?: { west: number; south: number; east: number; north: number }
  /** Only points that accept cash on delivery. */
  cod?: boolean
  /** Only points where parcels can be dropped off (`option_send`). */
  sending?: boolean
  limit?: number
}

export type PointWithDistance = ApaczkaPoint & { distance_km?: number }

export type PointClusterQuery = {
  type: string
  countryCode?: string
  /** The map area to cluster. */
  bbox: MapArea
  /** The map's zoom level (0–20). */
  zoom: number
  cod?: boolean
  sending?: boolean
}

/**
 * Apaczka dictionaries.
 *
 * - The service structure changes rarely, so it is kept in memory and
 *   refreshed on a TTL (daily by default). If a refresh fails, the stale copy
 *   keeps being used. Concurrent callers share one in-flight request.
 * - Parcel point lists are large (tens of thousands of lockers per carrier),
 *   so they live in the database and are refreshed by the point directory
 *   (see `ApaczkaPointDirectory`); searches run there.
 */
export class ApaczkaCatalog {
  private structure?: CacheEntry<ApaczkaServiceStructure>
  private structureInFlight?: Promise<ApaczkaServiceStructure>

  constructor(
    private readonly client: ApaczkaClient,
    private readonly config: {
      serviceStructureTtlMs: number
      /**
       * Countries points may be fetched for (ISO alpha-2). The store API is
       * public, so anything else is rejected before it reaches Apaczka.
       */
      pointCountries?: string[]
      logger?: ApaczkaLogger
      now?: () => number
    },
    /** Stored point lists; without it, point methods throw. */
    private readonly points?: ApaczkaPointDirectory
  ) {}

  private now(): number {
    return this.config.now?.() ?? Date.now()
  }

  async getServiceStructure(options: { refresh?: boolean } = {}): Promise<ApaczkaServiceStructure> {
    if (!options.refresh && this.structure && this.structure.expiresAt > this.now()) {
      return this.structure.value
    }
    if (this.structureInFlight) {
      return this.structureInFlight
    }

    this.structureInFlight = this.client
      .getServiceStructure()
      .then((value) => {
        this.structure = { value, expiresAt: this.now() + this.config.serviceStructureTtlMs }
        return value
      })
      .catch((error) => {
        if (this.structure) {
          this.config.logger?.warn(
            `[apaczka] Could not refresh the service structure, using the cached copy: ${(error as Error).message}`
          )
          return this.structure.value
        }
        throw error
      })
      .finally(() => {
        this.structureInFlight = undefined
      })

    return this.structureInFlight
  }

  async getServices(): Promise<ApaczkaService[]> {
    return listServices(await this.getServiceStructure())
  }

  async getService(serviceId: number): Promise<ApaczkaService | undefined> {
    return (await this.getServices()).find((service) => service.service_id === serviceId)
  }

  /** Point types (`points/{type}/`) the account supports. */
  async getPointTypes(): Promise<string[]> {
    const structure = await this.getServiceStructure()
    return toArray(structure.points_type as Record<string, string> | string[] | undefined).map(String)
  }

  /**
   * Rejects point types the account does not have and countries that are not
   * allowed, so public callers can't make the server call Apaczka with
   * made-up values or fill memory with lists nobody needs.
   */
  async assertPointQuery(type: string, countryCode: string): Promise<{ type: string; countryCode: string }> {
    const normalizedType = type.trim().toUpperCase()
    const normalizedCountry = countryCode.trim().toUpperCase()

    const allowedCountries = (this.config.pointCountries ?? ["PL"]).map((c) => c.toUpperCase())
    if (!/^[A-Z]{2}$/.test(normalizedCountry) || !allowedCountries.includes(normalizedCountry)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Parcel points are not available for country "${countryCode}". Allowed: ${allowedCountries.join(", ")}.`
      )
    }

    const types = (await this.getPointTypes()).map((t) => t.toUpperCase())
    if (!types.includes(normalizedType)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown parcel point type "${type}". Available: ${types.join(", ") || "none"}.`
      )
    }

    return { type: normalizedType, countryCode: normalizedCountry }
  }

  async findPoint(type: string, pointId: string, countryCode = "PL"): Promise<ApaczkaPoint | undefined> {
    const query = await this.assertPointQuery(type, countryCode)
    return this.directory().find(query.type, query.countryCode, pointId)
  }

  async searchPoints(query: PointSearchQuery): Promise<PointWithDistance[]> {
    const { type, countryCode } = await this.assertPointQuery(query.type, query.countryCode ?? "PL")
    const origin =
      Number.isFinite(query.latitude) && Number.isFinite(query.longitude)
        ? { latitude: query.latitude!, longitude: query.longitude! }
        : undefined

    const points = await this.directory().search({
      type,
      countryCode,
      terms: normalizeSearch(query.query ?? "")
        .split(/\s+/)
        .filter(Boolean),
      bbox: query.bbox,
      origin,
      cod: query.cod,
      sending: query.sending,
      limit: Math.min(Math.max(query.limit ?? 50, 1), 500),
    })

    if (!origin) {
      return points
    }
    return points.map((point) => {
      const lat = Number(point.address?.latitude)
      const lng = Number(point.address?.longitude)
      return {
        ...point,
        distance_km:
          point.address?.latitude && Number.isFinite(lat) && Number.isFinite(lng)
            ? haversineKm(origin.latitude, origin.longitude, lat, lng)
            : undefined,
      }
    })
  }

  /**
   * A map area's points grouped into clusters for a zoomed-out map (see
   * `clusterGrid`), so a map of the whole country shows where the points are
   * without loading tens of thousands of them.
   */
  async pointClusters(query: PointClusterQuery): Promise<PointCluster[]> {
    const { type, countryCode } = await this.assertPointQuery(query.type, query.countryCode ?? "PL")
    return this.directory().clusters({
      type,
      countryCode,
      bbox: query.bbox,
      zoom: query.zoom,
      cod: query.cod,
      sending: query.sending,
    })
  }

  /** Syncs one point list now and returns its state. For the admin's "Sync now". */
  async refreshPoints(type: string, countryCode = "PL"): Promise<PointSyncStatus | null> {
    const query = await this.assertPointQuery(type, countryCode)
    return this.directory().refresh(query.type, query.countryCode)
  }

  /** The state of every stored point list. */
  async pointStatuses(): Promise<PointSyncStatus[]> {
    return this.directory().statuses()
  }

  /** Drops the cached service structure. Stored point lists are not affected. */
  clear(): void {
    this.structure = undefined
  }

  private directory(): ApaczkaPointDirectory {
    if (!this.points) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Parcel point storage is not set up for this catalog")
    }
    return this.points
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100
}
