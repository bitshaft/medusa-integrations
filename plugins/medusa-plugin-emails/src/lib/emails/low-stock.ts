export type StockLevel = {
  inventory_item_id: string
  location_id: string
  available: number
  title: string
  sku: string | null
  location: string | null
}

export type SentAlert = { id: string; inventory_item_id: string; location_id: string }

const keyOf = (entry: { inventory_item_id: string; location_id: string }) =>
  `${entry.inventory_item_id}:${entry.location_id}`

/**
 * Compares stock levels with the alerts already sent.
 *
 * - `toAlert`: levels at or below the threshold nobody was told about yet.
 * - `toClear`: alerts whose item is back above the threshold (or gone), so
 *   the next shortage alerts again.
 */
export function diffLowStock(
  levels: StockLevel[],
  alerts: SentAlert[],
  threshold: number
): { toAlert: StockLevel[]; toClear: string[] } {
  const low = new Map(levels.filter((level) => level.available <= threshold).map((level) => [keyOf(level), level]))
  const alerted = new Set(alerts.map(keyOf))
  return {
    toAlert: [...low.values()]
      .filter((level) => !alerted.has(keyOf(level)))
      .sort((a, b) => a.available - b.available || a.title.localeCompare(b.title)),
    toClear: alerts.filter((alert) => !low.has(keyOf(alert))).map((alert) => alert.id),
  }
}
