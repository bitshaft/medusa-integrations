/** A map area in degrees. */
export type MapArea = { west: number; south: number; east: number; north: number }

/**
 * A group of points for a zoomed-out map: where it sits (the points' average
 * position), how many points it holds and the area they cover, so a click
 * can zoom the map to them.
 */
export type PointCluster = {
  latitude: number
  longitude: number
  count: number
  bounds: MapArea
  /** The point's ID when the cluster holds a single point. */
  id?: string
}

export type StoredClusterQuery = {
  type: string
  countryCode: string
  /** The map area to cluster. */
  bbox: MapArea
  /** The map's zoom level: the higher, the smaller the cells. */
  zoom: number
  cod?: boolean
  sending?: boolean
}

/** At most this many clusters per map view (a view normally has a few hundred cells at most). */
export const MAX_CLUSTERS = 2000

/**
 * Cells per 256-pixel map tile, across. Three makes a cell about 85 px on
 * screen, close to the 80 px grouping radius web maps use by default.
 */
const CELLS_PER_TILE = 3

/**
 * The grid a map view is clustered on. A cell is a third of a 256-pixel
 * map tile wide at the given zoom (about 85 px on screen) and as tall on
 * screen: web maps stretch latitude by 1/cos(latitude), so a cell spans
 * cos(latitude) times fewer degrees of latitude than of longitude.
 *
 * The grid starts at 0°, 0°, so cells stay put while the map pans (the
 * latitude is rounded to whole degrees for the same reason), and the area is
 * widened to whole cells, so clusters at its edges count all their points.
 */
export function clusterGrid(bbox: MapArea, zoom: number): { cellLng: number; cellLat: number; area: MapArea } {
  const cellLng = 360 / 2 ** zoom / CELLS_PER_TILE
  const latitude = Math.round((bbox.south + bbox.north) / 2)
  const cellLat = cellLng * Math.cos((latitude * Math.PI) / 180)
  return {
    cellLng,
    cellLat,
    area: {
      west: Math.max(-180, Math.floor(bbox.west / cellLng) * cellLng),
      south: Math.max(-90, Math.floor(bbox.south / cellLat) * cellLat),
      east: Math.min(180, Math.ceil(bbox.east / cellLng) * cellLng),
      north: Math.min(90, Math.ceil(bbox.north / cellLat) * cellLat),
    },
  }
}

/**
 * Groups located points into the grid's cells, the way the database query
 * does (`ApaczkaPointStore.clusters`), biggest first, ties by their lowest
 * point ID. For the in-memory store in tests.
 */
export function groupIntoClusters(
  points: Array<{ id: string; latitude: number; longitude: number }>,
  grid: { cellLng: number; cellLat: number }
): PointCluster[] {
  const cells = new Map<string, Array<{ id: string; latitude: number; longitude: number }>>()
  for (const point of points) {
    const key = `${Math.floor(point.longitude / grid.cellLng)}:${Math.floor(point.latitude / grid.cellLat)}`
    const cell = cells.get(key)
    if (cell) cell.push(point)
    else cells.set(key, [point])
  }
  return [...cells.values()]
    .map((members) => ({ members, firstId: members.map((m) => m.id).sort()[0] }))
    .sort((a, b) => b.members.length - a.members.length || (a.firstId < b.firstId ? -1 : a.firstId > b.firstId ? 1 : 0))
    .map(({ members }) => {
      const latitudes = members.map((m) => m.latitude)
      const longitudes = members.map((m) => m.longitude)
      const cluster: PointCluster = {
        latitude: latitudes.reduce((a, b) => a + b, 0) / members.length,
        longitude: longitudes.reduce((a, b) => a + b, 0) / members.length,
        count: members.length,
        bounds: {
          west: Math.min(...longitudes),
          south: Math.min(...latitudes),
          east: Math.max(...longitudes),
          north: Math.max(...latitudes),
        },
      }
      if (members.length === 1) cluster.id = members[0].id
      return cluster
    })
}
