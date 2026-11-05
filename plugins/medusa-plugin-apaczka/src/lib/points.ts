import type { PointWithDistance } from "./catalog"

/** The point shape returned by the store API and used by the storefront components. */
export type PublicPoint = {
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
  cod: boolean
  sending: boolean
  delivery: boolean
  distance_km: number | null
}

export function toPublicPoint(point: PointWithDistance): PublicPoint {
  const lat = Number(point.address?.latitude)
  const lng = Number(point.address?.longitude)
  return {
    id: point.foreign_address_id,
    type: point.type,
    subtype: point.subtype,
    name: point.name,
    address: {
      line1: point.address?.line1 ?? "",
      ...(point.address?.line2 ? { line2: point.address.line2 } : {}),
      postal_code: point.address?.postal_code ?? "",
      city: point.address?.city ?? "",
      country_code: point.address?.country_code ?? "",
    },
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    open_hours: typeof point.open_hours === "string" ? point.open_hours : null,
    description: point.additional_info || null,
    image_url: point.image_url || null,
    cod: point.option_cod !== false,
    sending: point.option_send !== false,
    delivery: point.option_deliver !== false,
    distance_km: point.distance_km ?? null,
  }
}
