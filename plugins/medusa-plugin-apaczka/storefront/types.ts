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
  open_hours: string | null
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

export type PointSearchParams = {
  type: string
  q?: string
  lat?: number
  lng?: number
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
