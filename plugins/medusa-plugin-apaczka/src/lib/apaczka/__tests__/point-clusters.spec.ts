import { clusterGrid, groupIntoClusters } from "../point-clusters"

const POLAND = { west: 14.1, south: 49.0, east: 24.2, north: 54.9 }

describe("clusterGrid", () => {
  it("makes cells a third of a map tile wide, as tall on screen", () => {
    const { cellLng, cellLat } = clusterGrid(POLAND, 6)
    // A tile spans 360 / 2^6 degrees of longitude at zoom 6.
    expect(cellLng).toBeCloseTo(360 / 64 / 3)
    // Around 52° N a degree of latitude is drawn 1/cos(52°) times taller.
    expect(cellLat).toBeCloseTo(cellLng * Math.cos((52 * Math.PI) / 180))
    // Each zoom step halves the cells.
    expect(clusterGrid(POLAND, 7).cellLng).toBeCloseTo(cellLng / 2)
  })

  it("widens the area to whole cells on a grid fixed at 0°, 0°", () => {
    const { cellLng, cellLat, area } = clusterGrid(POLAND, 8)
    for (const edge of [area.west, area.east])
      expect(Math.abs(edge / cellLng - Math.round(edge / cellLng))).toBeLessThan(1e-9)
    for (const edge of [area.south, area.north])
      expect(Math.abs(edge / cellLat - Math.round(edge / cellLat))).toBeLessThan(1e-9)
    expect(area.west).toBeLessThanOrEqual(POLAND.west)
    expect(area.east).toBeGreaterThanOrEqual(POLAND.east)
    expect(area.south).toBeLessThanOrEqual(POLAND.south)
    expect(area.north).toBeGreaterThanOrEqual(POLAND.north)
    // A small pan keeps the same cells.
    const panned = clusterGrid({ ...POLAND, west: POLAND.west + 0.01, east: POLAND.east + 0.01 }, 8)
    expect(panned.cellLat).toBe(cellLat)
  })

  it("stays inside the world at zoom 0", () => {
    expect(clusterGrid({ west: -180, south: -85, east: 180, north: 85 }, 0).area).toEqual({
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    })
  })
})

describe("groupIntoClusters", () => {
  it("counts each cell's points, at their average position, with their extent", () => {
    // Zoom 6: cells of 1.88° by 1.15°; both Warsaw points fall in one.
    const grid = clusterGrid(POLAND, 6)
    const clusters = groupIntoClusters(
      [
        { id: "WAW01M", latitude: 52.2, longitude: 20.9 },
        { id: "WAW02M", latitude: 52.3, longitude: 21.0 },
        { id: "KRA01M", latitude: 50.06, longitude: 19.94 },
      ],
      grid
    )
    expect(clusters).toHaveLength(2)
    const [warsaw, krakow] = clusters
    expect(warsaw).toMatchObject({ count: 2, bounds: { west: 20.9, south: 52.2, east: 21.0, north: 52.3 } })
    expect(warsaw.latitude).toBeCloseTo(52.25)
    expect(warsaw.longitude).toBeCloseTo(20.95)
    expect(warsaw.id).toBeUndefined()
    // A single point keeps its ID, so a map can show it as a pin.
    expect(krakow).toMatchObject({ count: 1, id: "KRA01M", latitude: 50.06, longitude: 19.94 })
  })
})
