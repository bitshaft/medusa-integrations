import { generateEntityId } from "@medusajs/framework/utils"

import type { ApaczkaPoint } from "./client"
import { summarizeOpenHours } from "./points"

/** Tables of the `apaczka_point*` models (see `src/modules/apaczka/models`). */
export const POINT_TABLE = "apaczka_point"
export const POINT_SYNC_TABLE = "apaczka_point_sync"

/** One stored parcel point, as written to `apaczka_point`. */
export type PointRow = {
  id: string
  type: string
  country_code: string
  external_id: string
  subtype: string | null
  name: string | null
  line1: string
  line2: string | null
  street: string | null
  house_number: string | null
  postal_code: string
  city: string
  latitude: number | null
  longitude: number | null
  /** JSON text on the way in; Postgres returns the parsed value. */
  open_hours: unknown
  open_hours_summary: string | null
  accepts_cod: boolean
  accepts_delivery: boolean
  accepts_sending: boolean
  image_url: string | null
  additional_info: string | null
  search: string
  synced_at: Date
}

/** Lowercase and strip Polish diacritics so "Łódź" matches "lodz". */
export function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "")
}

/**
 * An Apaczka point as a row. The carrier type and country come from the
 * request the list was fetched with. Points without an ID are skipped
 * (`null`): they could never be chosen.
 */
export function toPointRow(
  point: ApaczkaPoint,
  context: { type: string; countryCode: string; syncedAt: Date }
): PointRow | null {
  const externalId = String(point.foreign_address_id ?? "").trim()
  if (!externalId) {
    return null
  }
  const address = point.address ?? ({} as ApaczkaPoint["address"])
  const latitude = Number(address.latitude)
  const longitude = Number(address.longitude)
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0)

  return {
    id: generateEntityId(undefined, "apzpt"),
    type: context.type,
    country_code: context.countryCode,
    external_id: externalId,
    subtype: point.subtype || null,
    name: point.name || null,
    line1: address.line1 ?? "",
    line2: address.line2 || null,
    street: address.street || null,
    house_number: address.house_number || null,
    postal_code: address.postal_code ?? "",
    city: address.city ?? "",
    latitude: hasLocation ? latitude : null,
    longitude: hasLocation ? longitude : null,
    open_hours: point.open_hours == null ? null : JSON.stringify(point.open_hours),
    open_hours_summary: summarizeOpenHours(point.open_hours),
    accepts_cod: point.option_cod !== false,
    accepts_delivery: point.option_deliver !== false,
    accepts_sending: point.option_send !== false,
    image_url: point.image_url || null,
    additional_info: point.additional_info || null,
    search: normalizeSearch(
      [externalId, point.name, address.line1, address.city, address.postal_code].filter(Boolean).join(" ")
    ),
    synced_at: context.syncedAt,
  }
}

/** A stored row back in the shape Apaczka sends, so the rest of the plugin reads it unchanged. */
export function fromPointRow(row: Omit<PointRow, "open_hours"> & { open_hours: unknown }): ApaczkaPoint {
  return {
    type: row.type,
    subtype: row.subtype ?? "",
    name: row.name ?? row.external_id,
    foreign_address_id: row.external_id,
    address: {
      line1: row.line1,
      ...(row.line2 ? { line2: row.line2 } : {}),
      ...(row.street ? { street: row.street } : {}),
      ...(row.house_number ? { house_number: row.house_number } : {}),
      postal_code: row.postal_code,
      city: row.city,
      country_code: row.country_code,
      latitude: row.latitude == null ? "" : String(row.latitude),
      longitude: row.longitude == null ? "" : String(row.longitude),
    },
    ...(row.image_url ? { image_url: row.image_url } : {}),
    ...(row.open_hours == null ? {} : { open_hours: parseOpenHours(row.open_hours) }),
    option_cod: row.accepts_cod,
    option_send: row.accepts_sending,
    option_deliver: row.accepts_delivery,
    ...(row.additional_info ? { additional_info: row.additional_info } : {}),
  }
}

function parseOpenHours(value: unknown): ApaczkaPoint["open_hours"] {
  if (typeof value !== "string") {
    return value as ApaczkaPoint["open_hours"]
  }
  try {
    return JSON.parse(value) as ApaczkaPoint["open_hours"]
  } catch {
    return value
  }
}
