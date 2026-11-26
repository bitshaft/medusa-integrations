"use client"

import { useEffect, useRef, useState } from "react"

import { searchPoints } from "./client"
import type { ApaczkaPoint, ApaczkaStoreConfig, PointBounds } from "./types"

export type UsePointSearchOptions = {
  config: ApaczkaStoreConfig
  /** Point type, usually `getApaczkaOptionData(option).points_type`. */
  type: string | undefined
  query?: string
  origin?: { lat: number; lng: number } | null
  /** Only points inside this map area (e.g. the visible part of a map). */
  bbox?: PointBounds | null
  countryCode?: string
  cod?: boolean
  limit?: number
  /** Debounce for typing, in ms. Default 300. */
  debounceMs?: number
}

export type UsePointSearchResult = {
  points: ApaczkaPoint[]
  isLoading: boolean
  error: Error | null
}

/**
 * Headless point search: debounced, cancels stale responses. Use it to
 * build your own picker UI.
 */
export function usePointSearch(options: UsePointSearchOptions): UsePointSearchResult {
  const { config, type, query = "", origin, bbox, countryCode = "pl", cod, limit = 50, debounceMs = 300 } = options
  const [state, setState] = useState<UsePointSearchResult>({ points: [], isLoading: false, error: null })
  const requestId = useRef(0)
  const configRef = useRef(config)
  configRef.current = config

  useEffect(() => {
    if (!type) {
      setState({ points: [], isLoading: false, error: null })
      return
    }
    const id = ++requestId.current
    setState((current) => ({ ...current, isLoading: true, error: null }))

    const timer = setTimeout(() => {
      searchPoints(configRef.current, {
        type,
        q: query.trim() || undefined,
        lat: origin?.lat,
        lng: origin?.lng,
        bbox: bbox ?? undefined,
        countryCode,
        cod,
        limit,
      })
        .then((points) => {
          if (id === requestId.current) {
            setState({ points, isLoading: false, error: null })
          }
        })
        .catch((error: Error) => {
          if (id === requestId.current) {
            setState({ points: [], isLoading: false, error })
          }
        })
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [
    type,
    query,
    origin?.lat,
    origin?.lng,
    bbox?.west,
    bbox?.south,
    bbox?.east,
    bbox?.north,
    countryCode,
    cod,
    limit,
    debounceMs,
  ])

  return state
}
