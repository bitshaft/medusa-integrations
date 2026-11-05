"use client"

import type * as Leaflet from "leaflet"
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react"

import { getApaczkaOptionData } from "./client"
import type { ApaczkaPoint, ApaczkaStoreConfig } from "./types"
import { usePointSearch } from "./use-point-search"

const LABELS = {
  pl: {
    search: "Miasto, kod pocztowy lub ulica",
    locate: "Moja lokalizacja",
    loading: "Szukamy punktów…",
    empty: "Brak punktów dla tego wyszukiwania.",
    error: "Nie udało się wczytać punktów. Spróbuj ponownie.",
    select: "Wybierz",
    selected: "Wybrany",
    cod: "Pobranie",
    km: "km",
  },
  en: {
    search: "City, postal code or street",
    locate: "Use my location",
    loading: "Looking for points…",
    empty: "No points match this search.",
    error: "Could not load points. Please try again.",
    select: "Select",
    selected: "Selected",
    cod: "COD",
    km: "km",
  },
}

export type PointPickerLabels = typeof LABELS.en

export type PointPickerProps = {
  config: ApaczkaStoreConfig
  /** A Store API shipping option (its `data` holds the point type)… */
  shippingOption?: { data?: Record<string, unknown> | null } | null
  /** …or the point type directly, e.g. `INPOST`. */
  pointsType?: string
  /** Selected point ID. */
  value?: string | null
  onChange: (point: ApaczkaPoint) => void
  /** Prefill the search, e.g. with the shipping address postal code. */
  initialQuery?: string
  countryCode?: string
  /** Only show points that accept cash on delivery. Defaults to the option's COD flag. */
  cod?: boolean
  locale?: keyof typeof LABELS
  labels?: Partial<PointPickerLabels>
  /** Set to false for a list-only picker (no Leaflet needed). */
  showMap?: boolean
  height?: number
  limit?: number
  tileUrl?: string
  tileAttribution?: string
  /** Load Leaflet's CSS from unpkg. Disable if you bundle it yourself. */
  injectLeafletCss?: boolean
  className?: string
  style?: CSSProperties
}

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
const POLAND: [number, number] = [52.07, 19.48]

/**
 * Parcel point picker: search box, OpenStreetMap map (Leaflet) and a list.
 * Works with any point type Apaczka supports (InPost, Orlen Paczka, DPD
 * Pickup, Poczta Polska…). Leaflet is loaded lazily on the client, so the
 * component is safe to render on the server.
 *
 * Styling: every element has an `apaczka-picker__*` class, and colors come
 * from CSS variables (`--apaczka-accent`, `--apaczka-border`, …).
 */
export function PointPicker(props: PointPickerProps) {
  const {
    config,
    shippingOption,
    value,
    onChange,
    initialQuery = "",
    countryCode = "pl",
    locale = "pl",
    showMap = true,
    height = 420,
    limit = 50,
    tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    injectLeafletCss = true,
  } = props

  const optionData = getApaczkaOptionData(shippingOption)
  const type = props.pointsType ?? optionData?.points_type
  const cod = props.cod ?? optionData?.cod ?? false
  const labels = { ...LABELS[locale], ...props.labels }

  const [query, setQuery] = useState(initialQuery)
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null)
  const { points, isLoading, error } = usePointSearch({ config, type, query, origin, countryCode, cod, limit })

  const mapElement = useRef<HTMLDivElement>(null)
  const map = useRef<{ L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup } | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Create the map once, on the client.
  useEffect(() => {
    if (!showMap || !mapElement.current) {
      return
    }
    let disposed = false
    if (injectLeafletCss) {
      ensureStylesheet(LEAFLET_CSS)
    }
    import("leaflet").then((module) => {
      const L = ((module as unknown as { default?: typeof Leaflet }).default ?? module) as typeof Leaflet
      if (disposed || !mapElement.current) {
        return
      }
      const instance = L.map(mapElement.current, { zoomControl: true }).setView(POLAND, 6)
      L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 19 }).addTo(instance)
      map.current = { L, map: instance, layer: L.layerGroup().addTo(instance) }
    })
    return () => {
      disposed = true
      map.current?.map.remove()
      map.current = null
    }
  }, [showMap, tileUrl, tileAttribution, injectLeafletCss])

  // Redraw markers when results or the selection change.
  const located = useMemo(() => points.filter((p) => p.latitude !== null && p.longitude !== null), [points])
  useEffect(() => {
    const current = map.current
    if (!current) {
      return
    }
    const { L, map: instance, layer } = current
    layer.clearLayers()
    for (const point of located) {
      const isSelected = point.id === value
      L.circleMarker([point.latitude!, point.longitude!], {
        radius: isSelected ? 9 : 6,
        weight: 2,
        color: isSelected ? "var(--apaczka-accent, #e6007e)" : "#1f2937",
        fillColor: isSelected ? "var(--apaczka-accent, #e6007e)" : "#ffffff",
        fillOpacity: 1,
      })
        .bindTooltip(`${point.name} · ${point.address.line1}, ${point.address.city}`)
        .on("click", () => onChangeRef.current(point))
        .addTo(layer)
    }
    if (located.length) {
      const selected = located.find((p) => p.id === value)
      if (selected) {
        instance.setView([selected.latitude!, selected.longitude!], Math.max(instance.getZoom(), 14))
      } else {
        instance.fitBounds(L.latLngBounds(located.map((p) => [p.latitude!, p.longitude!])), {
          padding: [24, 24],
          maxZoom: 15,
        })
      }
    }
  }, [located, value])

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        setQuery("")
        setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 10_000 }
    )
  }

  return (
    <div
      className={["apaczka-picker", props.className].filter(Boolean).join(" ")}
      style={{ ...styles.root, ...props.style }}
    >
      <div className="apaczka-picker__toolbar" style={styles.toolbar}>
        <input
          className="apaczka-picker__search"
          style={styles.input}
          type="search"
          value={query}
          placeholder={labels.search}
          aria-label={labels.search}
          onChange={(event) => {
            setOrigin(null)
            setQuery(event.target.value)
          }}
        />
        {typeof navigator !== "undefined" && "geolocation" in navigator && (
          <button type="button" className="apaczka-picker__locate" style={styles.button} onClick={locate}>
            {labels.locate}
          </button>
        )}
      </div>

      <div className="apaczka-picker__body" style={{ ...styles.body, height }}>
        {showMap && <div ref={mapElement} className="apaczka-picker__map" style={styles.map} />}
        <ul className="apaczka-picker__list" style={styles.list} role="listbox" aria-label={labels.search}>
          {isLoading && <li style={styles.message}>{labels.loading}</li>}
          {!isLoading && error && <li style={styles.message}>{labels.error}</li>}
          {!isLoading && !error && !points.length && <li style={styles.message}>{labels.empty}</li>}
          {points.map((point) => {
            const isSelected = point.id === value
            return (
              <li
                key={point.id}
                role="option"
                aria-selected={isSelected}
                className={`apaczka-picker__item${isSelected ? " apaczka-picker__item--selected" : ""}`}
                style={{ ...styles.item, ...(isSelected ? styles.itemSelected : {}) }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={styles.itemTitle}>
                    {point.name}
                    {point.cod && <span style={styles.tag}>{labels.cod}</span>}
                  </div>
                  <div style={styles.itemText}>
                    {point.address.line1}, {point.address.postal_code} {point.address.city}
                  </div>
                  {(point.open_hours || point.distance_km !== null) && (
                    <div style={styles.itemMuted}>
                      {[point.open_hours, point.distance_km !== null ? `${point.distance_km} ${labels.km}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="apaczka-picker__select"
                  style={{ ...styles.button, ...(isSelected ? styles.buttonSelected : {}) }}
                  onClick={() => onChange(point)}
                >
                  {isSelected ? labels.selected : labels.select}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function ensureStylesheet(href: string) {
  if (typeof document === "undefined" || document.querySelector(`link[href="${href}"]`)) {
    return
  }
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = href
  document.head.appendChild(link)
}

const styles: Record<string, CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontFamily: "inherit",
    color: "var(--apaczka-text, inherit)",
  },
  toolbar: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: {
    flex: "1 1 220px",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--apaczka-border, #d1d5db)",
    font: "inherit",
    background: "var(--apaczka-surface, #fff)",
    color: "inherit",
  },
  body: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
    minHeight: 0,
  },
  map: { width: "100%", height: "100%", minHeight: 240, borderRadius: 8, overflow: "hidden" },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    overflowY: "auto",
    border: "1px solid var(--apaczka-border, #e5e7eb)",
    borderRadius: 8,
  },
  message: { padding: 16, fontSize: 14, color: "var(--apaczka-muted, #6b7280)" },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderBottom: "1px solid var(--apaczka-border, #f3f4f6)",
  },
  itemSelected: { background: "var(--apaczka-selected, rgba(230, 0, 126, 0.06))" },
  itemTitle: { fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 },
  itemText: { fontSize: 13 },
  itemMuted: { fontSize: 12, color: "var(--apaczka-muted, #6b7280)" },
  tag: {
    fontSize: 11,
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: 999,
    border: "1px solid var(--apaczka-border, #d1d5db)",
  },
  button: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--apaczka-border, #d1d5db)",
    background: "var(--apaczka-surface, #fff)",
    color: "inherit",
    font: "inherit",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  buttonSelected: {
    background: "var(--apaczka-accent, #e6007e)",
    borderColor: "var(--apaczka-accent, #e6007e)",
    color: "var(--apaczka-accent-text, #fff)",
  },
}
