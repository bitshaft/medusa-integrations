import { ApaczkaClient, type ApaczkaPoint } from "../client"
import { ApaczkaCatalog } from "../catalog"
import { ApaczkaPointDirectory } from "../point-directory"
import { summarizeOpenHours, toPublicPoint } from "../points"
import { APP_ID, APP_SECRET, serviceStructure } from "./fixtures"
import { MemoryPointStore } from "./memory-point-store"

const point = (
  id: string,
  city: string,
  lat: number,
  lng: number,
  extra: Partial<ApaczkaPoint> = {}
): ApaczkaPoint => ({
  type: "INPOST",
  subtype: "parcel_locker",
  name: id,
  foreign_address_id: id,
  address: {
    line1: `Ulica ${id}`,
    postal_code: "00-001",
    city,
    country_code: "PL",
    latitude: String(lat),
    longitude: String(lng),
  },
  ...extra,
})

const points = [
  point("WAW01M", "Warszawa", 52.23, 21.01),
  point("LOD01M", "Łódź", 51.76, 19.46, { option_cod: false }),
  point("KRA01M", "Kraków", 50.06, 19.94),
]

function setup() {
  const client = new ApaczkaClient({ appId: APP_ID, appSecret: APP_SECRET, fetch: jest.fn() })
  const structure = jest.spyOn(client, "getServiceStructure").mockResolvedValue(serviceStructure)
  const getPoints = jest.spyOn(client, "getPoints").mockResolvedValue(points)
  let now = 1_000_000
  const logger = { warn: jest.fn(), info: jest.fn() }
  const store = new MemoryPointStore()
  const directory = new ApaczkaPointDirectory(client, store, {
    source: "production",
    refreshAfterMs: 60_000,
    logger,
    now: () => now,
  })
  const catalog = new ApaczkaCatalog(
    client,
    { serviceStructureTtlMs: 1000, pointCountries: ["PL", "CZ"], logger, now: () => now },
    directory
  )
  return { catalog, structure, getPoints, store, advance: (ms: number) => (now += ms) }
}

describe("ApaczkaCatalog", () => {
  it("caches the service structure until the TTL expires", async () => {
    const { catalog, structure, advance } = setup()
    await catalog.getServiceStructure()
    await catalog.getServiceStructure()
    expect(structure).toHaveBeenCalledTimes(1)
    advance(1001)
    await catalog.getServiceStructure()
    expect(structure).toHaveBeenCalledTimes(2)
  })

  it("shares one in-flight request between concurrent callers", async () => {
    const { catalog, structure } = setup()
    await Promise.all([catalog.getServiceStructure(), catalog.getServiceStructure(), catalog.getServices()])
    expect(structure).toHaveBeenCalledTimes(1)
  })

  it("keeps serving the stale copy when a refresh fails", async () => {
    const { catalog, structure, advance } = setup()
    await catalog.getServiceStructure()
    advance(1001)
    structure.mockRejectedValueOnce(new Error("down"))
    await expect(catalog.getServiceStructure()).resolves.toBe(serviceStructure)
  })

  it("throws when there is nothing cached", async () => {
    const { catalog, structure } = setup()
    structure.mockRejectedValueOnce(new Error("down"))
    await expect(catalog.getServiceStructure()).rejects.toThrow("down")
  })

  it("finds services and point types", async () => {
    const { catalog } = setup()
    expect((await catalog.getService(41))?.supplier).toBe("INPOST")
    expect(await catalog.getService(999)).toBeUndefined()
    expect(await catalog.getPointTypes()).toEqual(["INPOST", "DPD", "POCZTA"])
  })

  it("finds a point by ID, case-insensitively", async () => {
    const { catalog } = setup()
    expect((await catalog.findPoint("inpost", " waw01m "))?.foreign_address_id).toBe("WAW01M")
    expect(await catalog.findPoint("INPOST", "NOPE")).toBeUndefined()
  })

  it("searches without diacritics and sorts by distance", async () => {
    const { catalog } = setup()
    expect((await catalog.searchPoints({ type: "INPOST", query: "lodz" })).map((p) => p.foreign_address_id)).toEqual([
      "LOD01M",
    ])

    const near = await catalog.searchPoints({ type: "INPOST", latitude: 50.05, longitude: 19.93, limit: 2 })
    expect(near.map((p) => p.foreign_address_id)).toEqual(["KRA01M", "LOD01M"])
    expect(near[0].distance_km).toBeLessThan(2)
  })

  it("lists the best matches first: the point code, the city, then the rest", async () => {
    const { catalog, getPoints } = setup()
    const street = (id: string, city: string, line1: string) =>
      point(id, city, 51.9, 19.6, {
        address: { line1, postal_code: "95-100", city, country_code: "PL", latitude: "51.9", longitude: "19.6" },
      })
    getPoints.mockResolvedValue([
      point("ALE01M", "Aleksandrów Łódzki", 51.82, 19.3),
      street("GLO01M", "Głowno", "ul. Łódzka 5"),
      point("LOD02M", "Łódź", 51.75, 19.45),
      point("LOD01M", "Łódź", 51.76, 19.46),
      point("BYT01M", "Bytom", 50.35, 18.92),
    ])
    const ids = async (query: string) =>
      (await catalog.searchPoints({ type: "INPOST", query })).map((p) => p.foreign_address_id)

    // "Łódź" first lists Łódź, not Aleksandrów Łódzki (which sorts earlier) or a street called Łódzka.
    expect(await ids("Łódź")).toEqual(["LOD01M", "LOD02M", "ALE01M", "GLO01M"])
    // A city starting with the text comes next.
    expect((await ids("aleksandrow"))[0]).toBe("ALE01M")
    // A postal code prefix.
    expect((await ids("95-1"))[0]).toBe("GLO01M")
    // A point's code wins over everything.
    expect(await ids("byt01m")).toEqual(["BYT01M"])
  })

  it("filters points that do not accept COD", async () => {
    const { catalog } = setup()
    const result = await catalog.searchPoints({ type: "INPOST", cod: true })
    expect(result.map((p) => p.foreign_address_id)).not.toContain("LOD01M")
  })

  it("rejects point types the account does not have", async () => {
    const { catalog, getPoints } = setup()
    await expect(catalog.searchPoints({ type: "MADE_UP" })).rejects.toThrow('Unknown parcel point type "MADE_UP"')
    expect(getPoints).not.toHaveBeenCalled()
  })

  it("rejects countries that are not allowed", async () => {
    const { catalog, getPoints } = setup()
    await expect(catalog.findPoint("INPOST", "WAW01M", "DE")).rejects.toThrow("not available for country")
    await expect(catalog.searchPoints({ type: "INPOST", countryCode: "P1" })).rejects.toThrow(
      "not available for country"
    )
    expect(getPoints).not.toHaveBeenCalled()
  })

  it("returns only the points inside a map area", async () => {
    const { catalog } = setup()
    const result = await catalog.searchPoints({
      type: "INPOST",
      bbox: { west: 19, south: 50, east: 20, north: 52 },
    })
    expect(result.map((p) => p.foreign_address_id).sort()).toEqual(["KRA01M", "LOD01M"])
  })

  it("clusters a zoomed-out map's points, storing the list first", async () => {
    const { catalog, getPoints } = setup()
    const poland = { west: 14.1, south: 49.0, east: 24.2, north: 54.9 }
    // Zoom 4: cells of 7.5° x 4.6°, so Warszawa and Łódź share one.
    const far = await catalog.pointClusters({ type: "inpost", bbox: poland, zoom: 4 })
    expect(getPoints).toHaveBeenCalledTimes(1)
    expect(far.map((c) => c.count)).toEqual([2, 1])
    // Zoom 8: every city is a cluster of one, with its point's ID.
    const near = await catalog.pointClusters({ type: "INPOST", bbox: poland, zoom: 8 })
    expect(near.map((c) => c.id).sort()).toEqual(["KRA01M", "LOD01M", "WAW01M"])
    // Filters and checks work as for searches.
    const cod = await catalog.pointClusters({ type: "INPOST", bbox: poland, zoom: 8, cod: true })
    expect(cod.map((c) => c.id).sort()).toEqual(["KRA01M", "WAW01M"])
    await expect(catalog.pointClusters({ type: "NOPE", bbox: poland, zoom: 6 })).rejects.toThrow()
    expect(getPoints).toHaveBeenCalledTimes(1)
  })

  it("stores each type and country once, then searches the stored list", async () => {
    const { catalog, getPoints, store } = setup()
    await catalog.searchPoints({ type: "INPOST" })
    await catalog.searchPoints({ type: "inpost", countryCode: "pl", query: "krakow" })
    await catalog.findPoint("INPOST", "WAW01M")
    await catalog.searchPoints({ type: "INPOST", countryCode: "CZ" })
    expect(getPoints).toHaveBeenCalledTimes(2)
    expect(getPoints).toHaveBeenCalledWith("INPOST", { country_code: "PL" })
    expect(getPoints).toHaveBeenCalledWith("INPOST", { country_code: "CZ" })
    expect(store.rows).toHaveLength(6)
  })

  it("reports the stored lists", async () => {
    const { catalog } = setup()
    await catalog.searchPoints({ type: "INPOST" })
    expect(await catalog.pointStatuses()).toEqual([
      expect.objectContaining({ type: "INPOST", country_code: "PL", point_count: 3, source: "production" }),
    ])
  })
})

describe("toPublicPoint", () => {
  // Shape taken from a real production `points/INPOST/` response.
  const real = {
    type: "INPOST",
    subtype: "parcel_locker",
    name: "Przy sklepie Lewiatan",
    foreign_address_id: "ADA01M",
    address: {
      line1: "Kościuszki 27",
      line2: null as unknown as string,
      postal_code: "21-412",
      city: "Adamów",
      country_code: "PL",
      longitude: "22.26405000",
      latitude: "51.73834000",
    },
    image_url: null as unknown as string,
    open_hours: Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [["00:00", "23:59"]]])
    ),
    option_cod: true,
    option_send: true,
    option_deliver: true,
    additional_info: "",
    distance: 0,
  }

  it("maps a real InPost point", () => {
    expect(toPublicPoint(real)).toMatchObject({
      id: "ADA01M",
      name: "Przy sklepie Lewiatan",
      address: { line1: "Kościuszki 27", city: "Adamów" },
      latitude: 51.73834,
      longitude: 22.26405,
      open_hours: "24/7",
      image_url: null,
      cod: true,
    })
    expect(toPublicPoint(real).address).not.toHaveProperty("line2")
  })

  it("summarizes weekly opening hours", () => {
    expect(
      summarizeOpenHours({
        mon: [["08:00", "20:00"]],
        tue: [["08:00", "20:00"]],
        wed: [["08:00", "20:00"]],
        thu: [["08:00", "20:00"]],
        fri: [["08:00", "20:00"]],
        sat: [["09:00", "14:00"]],
        sun: [],
      })
    ).toBe("Mon–Fri 08:00–20:00, Sat 09:00–14:00")
    expect(summarizeOpenHours("pn-pt 9-17")).toBe("pn-pt 9-17")
    expect(summarizeOpenHours(null)).toBeNull()
  })
})
