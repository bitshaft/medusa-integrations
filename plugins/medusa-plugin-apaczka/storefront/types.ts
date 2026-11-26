/** A parcel point as returned by `GET /store/apaczka/points`. */
export type ApaczkaPoint = {
  id: string
  type: string
  subtype: string
  name: string
  address: {
    line1: string
    line2?: string
    postal_code: string
    city: string
    country_code: string
  }
  latitude: number | null
  longitude: number | null
  /** Short summary, e.g. `24/7` or `pon–pt 08:00–20:00`. */
  open_hours: string | null
  /** Per-day hours: `mon`…`sun` → `[from, to][]`. */
  open_hours_detail: Record<string, Array<[string, string]>> | null
  description: string | null
  image_url: string | null
  /** Accepts cash on delivery. */
  cod: boolean
  /** Parcels can be dropped off here. */
  sending: boolean
  /** Parcels can be delivered here. */
  delivery: boolean
  distance_km: number | null
}

/** The Apaczka part of `shipping_option.data`, as returned by the Store API. */
export type ApaczkaOptionData = {
  id: string
  name: string
  service_id: number
  supplier: string
  cod: boolean
  is_return: boolean
  origin: "door" | "point"
  destination: "door" | "point"
  domestic: boolean
  points_type?: string
}

/** A map area in degrees, e.g. a Leaflet map's bounds. */
export type PointBounds = { west: number; south: number; east: number; north: number }

/** A group of points for a zoomed-out map (`GET /store/apaczka/points/clusters`). */
export type PointCluster = {
  /** The points' average position: where to draw the cluster. */
  latitude: number
  longitude: number
  count: number
  /** The points' extent: zoom the map to it when the cluster is clicked. */
  bounds: PointBounds
  /** The point's ID when the cluster holds a single point. */
  id?: string
}

export type PointClusterParams = {
  type: string
  /** The map's visible area. */
  bbox: PointBounds
  /** The map's zoom level (whole steps). */
  zoom: number
  countryCode?: string
  cod?: boolean
}

export type PointSearchParams = {
  type: string
  q?: string
  lat?: number
  lng?: number
  /** Only points inside this map area. */
  bbox?: PointBounds
  countryCode?: string
  cod?: boolean
  limit?: number
}

/**
 * How the components reach your Medusa backend. Either pass `baseUrl` and
 * `publishableKey`, or a `fetcher` that wraps your own client, e.g.
 *
 * ```ts
 * const fetcher = (path, query) => sdk.client.fetch(path, { query })
 * ```
 */
export type ApaczkaStoreConfig =
  | { baseUrl: string; publishableKey: string; fetcher?: never }
  | {
      fetcher: (path: string, query: Record<string, string>) => Promise<unknown>
      baseUrl?: never
      publishableKey?: never
    }
