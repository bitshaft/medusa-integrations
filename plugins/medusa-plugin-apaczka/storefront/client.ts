import type {
  ApaczkaOptionData,
  ApaczkaPoint,
  ApaczkaStoreConfig,
  PointCluster,
  PointClusterParams,
  PointSearchParams,
} from "./types"

/** Calls `GET /store/apaczka/points`. */
export async function searchPoints(config: ApaczkaStoreConfig, params: PointSearchParams): Promise<ApaczkaPoint[]> {
  const query: Record<string, string> = { type: params.type }
  if (params.q) query.q = params.q
  if (params.lat !== undefined) query.lat = String(params.lat)
  if (params.lng !== undefined) query.lng = String(params.lng)
  if (params.bbox) {
    const { west, south, east, north } = params.bbox
    query.bbox = [west, south, east, north].join(",")
  }
  if (params.countryCode) query.country_code = params.countryCode.toLowerCase()
  if (params.cod) query.cod = "true"
  if (params.limit) query.limit = String(params.limit)

  const response = (await request(config, "/store/apaczka/points", query)) as { points: ApaczkaPoint[] }
  return response.points ?? []
}

/**
 * Calls `GET /store/apaczka/points/clusters`: a zoomed-out map's points,
 * grouped, so a map of the whole country shows where the points are without
 * loading each of them.
 */
export async function searchClusters(config: ApaczkaStoreConfig, params: PointClusterParams): Promise<PointCluster[]> {
  const { west, south, east, north } = params.bbox
  const query: Record<string, string> = {
    type: params.type,
    bbox: [west, south, east, north].join(","),
    zoom: String(Math.round(params.zoom)),
  }
  if (params.countryCode) query.country_code = params.countryCode.toLowerCase()
  if (params.cod) query.cod = "true"

  const response = (await request(config, "/store/apaczka/points/clusters", query)) as { clusters: PointCluster[] }
  return response.clusters ?? []
}

/** Calls `GET /store/apaczka/points/:type/:id`. */
export async function getPoint(
  config: ApaczkaStoreConfig,
  type: string,
  id: string,
  countryCode = "pl"
): Promise<ApaczkaPoint | null> {
  try {
    const response = (await request(
      config,
      `/store/apaczka/points/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
      { country_code: countryCode }
    )) as { point: ApaczkaPoint }
    return response.point ?? null
  } catch {
    return null
  }
}

/**
 * Reads the Apaczka data from a Store API shipping option, or `null` when
 * the option is not an Apaczka one.
 */
export function getApaczkaOptionData(
  option: { data?: Record<string, unknown> | null } | null | undefined
): ApaczkaOptionData | null {
  const data = option?.data as Partial<ApaczkaOptionData> | undefined
  if (!data || typeof data.id !== "string" || !data.id.startsWith("apaczka-")) {
    return null
  }
  return data as ApaczkaOptionData
}

/** True when the customer must choose a parcel point for this option. */
export function requiresPoint(option: { data?: Record<string, unknown> | null } | null | undefined): boolean {
  const data = getApaczkaOptionData(option)
  return Boolean(data && !data.is_return && data.destination === "point")
}

/** The `data` to send with `addShippingMethod` for a chosen point. */
export function shippingMethodData(point: Pick<ApaczkaPoint, "id">): { point_id: string } {
  return { point_id: point.id }
}

async function request(config: ApaczkaStoreConfig, path: string, query: Record<string, string>): Promise<unknown> {
  if (config.fetcher) {
    return config.fetcher(path, query)
  }
  const url = `${config.baseUrl.replace(/\/+$/, "")}${path}?${new URLSearchParams(query).toString()}`
  const response = await fetch(url, {
    headers: { "x-publishable-api-key": config.publishableKey, Accept: "application/json" },
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error(`Apaczka points request failed (HTTP ${response.status})`)
  }
  return response.json()
}
