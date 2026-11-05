import {
  ApaczkaClient,
  type ApaczkaLogger,
  type ApaczkaPoint,
  type ApaczkaService,
  type ApaczkaServiceStructure,
  listServices,
  toArray,
} from "./apaczka"

type CacheEntry<T> = { value: T; expiresAt: number }

export type PointSearchQuery = {
  type: string
  countryCode?: string
  /** Free text matched against name/ID, street, city and postal code. */
  query?: string
  latitude?: number
  longitude?: number
  /** Only points that accept cash on delivery. */
  cod?: boolean
  /** Only points where parcels can be dropped off (`option_send`). */
  sending?: boolean
  limit?: number
}

export type PointWithDistance = ApaczkaPoint & { distance_km?: number }

/**
 * In-memory cache for Apaczka dictionaries.
 *
 * - The service structure changes rarely, so it is refreshed on a TTL
 *   (daily by default). If a refresh fails, the stale copy keeps being used.
 * - Point lists can be large (tens of thousands of lockers), so each
 *   type/country pair is fetched once per TTL and searched locally.
 *
 * Concurrent callers share one in-flight request.
 */
export class ApaczkaCatalog {
  private structure?: CacheEntry<ApaczkaServiceStructure>
  private structureInFlight?: Promise<ApaczkaServiceStructure>
  private readonly points = new Map<string, CacheEntry<ApaczkaPoint[]>>()
  private readonly pointsInFlight = new Map<string, Promise<ApaczkaPoint[]>>()

  constructor(
    private readonly client: ApaczkaClient,
    private readonly config: {
      serviceStructureTtlMs: number
      pointsTtlMs: number
      logger?: ApaczkaLogger
      now?: () => number
    }
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

  async getPoints(type: string, countryCode = "PL"): Promise<ApaczkaPoint[]> {
    const key = `${type.toUpperCase()}:${countryCode.toUpperCase()}`
    const cached = this.points.get(key)
    if (cached && cached.expiresAt > this.now()) {
      return cached.value
    }

    const inFlight = this.pointsInFlight.get(key)
    if (inFlight) {
      return inFlight
    }

    const request = this.client
      .getPoints(type.toUpperCase(), { country_code: countryCode.toUpperCase() })
      .then((value) => {
        this.points.set(key, { value, expiresAt: this.now() + this.config.pointsTtlMs })
        return value
      })
      .catch((error) => {
        if (cached) {
          this.config.logger?.warn(
            `[apaczka] Could not refresh ${key} points, using the cached copy: ${(error as Error).message}`
          )
          return cached.value
        }
        throw error
      })
      .finally(() => this.pointsInFlight.delete(key))

    this.pointsInFlight.set(key, request)
    return request
  }

  async findPoint(type: string, pointId: string, countryCode = "PL"): Promise<ApaczkaPoint | undefined> {
    const id = pointId.trim().toUpperCase()
    const points = await this.getPoints(type, countryCode)
    return points.find(
      (point) => point.foreign_address_id?.toUpperCase() === id || point.name?.toUpperCase() === id
    )
  }

  async searchPoints(query: PointSearchQuery): Promise<PointWithDistance[]> {
    const points = await this.getPoints(query.type, query.countryCode)
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 500)
    const terms = normalize(query.query ?? "")
      .split(/\s+/)
      .filter(Boolean)

    const hasOrigin = Number.isFinite(query.latitude) && Number.isFinite(query.longitude)

    const filtered: PointWithDistance[] = []
    for (const point of points) {
      if (query.cod && point.option_cod === false) {
        continue
      }
      if (query.sending && point.option_send === false) {
        continue
      }
      if (terms.length) {
        const haystack = normalize(
          [point.foreign_address_id, point.name, point.address?.line1, point.address?.city, point.address?.postal_code]
            .filter(Boolean)
            .join(" ")
        )
        if (!terms.every((term) => haystack.includes(term))) {
          continue
        }
      }
      if (hasOrigin) {
        const lat = Number(point.address?.latitude)
        const lng = Number(point.address?.longitude)
        filtered.push({
          ...point,
          distance_km:
            Number.isFinite(lat) && Number.isFinite(lng)
              ? haversineKm(query.latitude!, query.longitude!, lat, lng)
              : undefined,
        })
      } else {
        filtered.push(point)
      }
    }

    if (hasOrigin) {
      filtered.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))
    }

    return filtered.slice(0, limit)
  }

  /** Drops all cached data. */
  clear(): void {
    this.structure = undefined
    this.points.clear()
  }
}

/** Lowercase and strip Polish diacritics so "Łódź" matches "lodz". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100
}
