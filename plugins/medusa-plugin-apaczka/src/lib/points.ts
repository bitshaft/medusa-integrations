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
  /** Short summary, e.g. `24/7` or `pon–pt 08:00–20:00, sob 09:00–14:00`. */
  open_hours: string | null
  /** Per-day opening hours as returned by Apaczka (`mon`…`sun` → `[from, to][]`). */
  open_hours_detail: Record<string, Array<[string, string]>> | null
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
    open_hours: summarizeOpenHours(point.open_hours),
    open_hours_detail: openHoursDetail(point.open_hours),
    description: point.additional_info || null,
    image_url: point.image_url || null,
    cod: point.option_cod !== false,
    sending: point.option_send !== false,
    delivery: point.option_deliver !== false,
    distance_km: point.distance_km ?? null,
  }
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  mon: "pon",
  tue: "wt",
  wed: "śr",
  thu: "czw",
  fri: "pt",
  sat: "sob",
  sun: "nd",
}

function openHoursDetail(value: unknown): Record<string, Array<[string, string]>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  const detail: Record<string, Array<[string, string]>> = {}
  for (const day of DAYS) {
    const ranges = (value as Record<string, unknown>)[day]
    if (Array.isArray(ranges)) {
      detail[day] = ranges
        .filter((r): r is [string, string] => Array.isArray(r) && r.length >= 2)
        .map(([from, to]) => [String(from), String(to)])
    }
  }
  return Object.keys(detail).length ? detail : null
}

/**
 * Apaczka sends opening hours as text for some carriers and as a per-day
 * object for others (`{ mon: [["08:00","20:00"]], … }`). Returns a short
 * summary, grouping consecutive days with the same hours.
 */
export function summarizeOpenHours(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null
  }
  const detail = openHoursDetail(value)
  if (!detail) {
    return null
  }

  const format = (day: (typeof DAYS)[number]) => (detail[day] ?? []).map(([from, to]) => `${from}–${to}`).join(", ")

  if (DAYS.every((day) => /^00:00–23:5[89]$|^00:00–24:00$/.test(format(day)))) {
    return "24/7"
  }

  const groups: Array<{ from: string; to: string; hours: string }> = []
  for (const day of DAYS) {
    const hours = format(day)
    if (!hours) {
      continue
    }
    const last = groups[groups.length - 1]
    const previousDay = DAYS[DAYS.indexOf(day) - 1]
    if (last && last.hours === hours && last.to === DAY_LABELS[previousDay]) {
      last.to = DAY_LABELS[day]
    } else {
      groups.push({ from: DAY_LABELS[day], to: DAY_LABELS[day], hours })
    }
  }

  return groups.map((g) => `${g.from === g.to ? g.from : `${g.from}–${g.to}`} ${g.hours}`).join(", ") || null
}
