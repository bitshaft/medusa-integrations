"use client"

import { useEffect, useRef, useState } from "react"

import { searchClusters } from "./client"
import type { ApaczkaStoreConfig, PointBounds, PointCluster } from "./types"

export type UsePointClustersOptions = {
  config: ApaczkaStoreConfig
  /**
   * Point type, usually `getApaczkaOptionData(option).points_type`. Pass
   * `undefined` to load nothing, e.g. once the map is zoomed in far enough
   * to show the points themselves.
   */
  type: string | undefined
  /** The map's visible area. */
  bbox: PointBounds | null | undefined
  /** The map's zoom level. */
  zoom: number | null | undefined
  countryCode?: string
  cod?: boolean
  /** Debounce for map moves, in ms. Default 250. */
  debounceMs?: number
}

export type UsePointClustersResult = {
  clusters: PointCluster[]
  isLoading: boolean
  error: Error | null
}

type Loaded = { key: string; zoom: number; clusters: PointCluster[]; error: Error | null }

// One empty list for every "nothing yet", so callers comparing results by identity see no change.
const NO_CLUSTERS: PointCluster[] = []

/**
 * Clusters for a zoomed-out map (`searchClusters`): debounced, stale
 * responses dropped. While the map pans, the last view's clusters stay up
 * until the new ones arrive; a zoom change drops them.
 */
export function usePointClusters(options: UsePointClustersOptions): UsePointClustersResult {
  const { config, type, bbox, zoom, countryCode = "pl", cod = false, debounceMs = 250 } = options
  const level = typeof zoom === "number" ? Math.round(zoom) : null
  // Everything a request depends on, as one value the effect can follow.
  const key =
    type && bbox && level !== null
      ? JSON.stringify([type, bbox.west, bbox.south, bbox.east, bbox.north, level, countryCode, cod])
      : null
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const requestId = useRef(0)
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  })

  useEffect(() => {
    if (!key) return
    const [pointType, west, south, east, north, at, country, codOnly] = JSON.parse(key) as [
      string,
      number,
      number,
      number,
      number,
      number,
      string,
      boolean,
    ]
    const id = ++requestId.current
    const timer = setTimeout(() => {
      searchClusters(configRef.current, {
        type: pointType,
        bbox: { west, south, east, north },
        zoom: at,
        countryCode: country,
        cod: codOnly,
      })
        .then((clusters) => {
          if (id === requestId.current) setLoaded({ key, zoom: at, clusters, error: null })
        })
        .catch((error: Error) => {
          if (id === requestId.current) setLoaded({ key, zoom: at, clusters: NO_CLUSTERS, error })
        })
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [key, debounceMs])

  if (!key) {
    return { clusters: NO_CLUSTERS, isLoading: false, error: null }
  }
  const fresh = loaded?.key === key
  return {
    clusters: loaded && (fresh || loaded.zoom === level) ? loaded.clusters : NO_CLUSTERS,
    isLoading: !fresh,
    error: fresh ? (loaded?.error ?? null) : null,
  }
}
