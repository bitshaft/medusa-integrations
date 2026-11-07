import { ApaczkaClient, type ApaczkaPoint } from "../apaczka"
import { ApaczkaCatalog } from "../catalog"
import { summarizeOpenHours, toPublicPoint } from "../points"
import { APP_ID, APP_SECRET, serviceStructure } from "./fixtures"

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
  const catalog = new ApaczkaCatalog(client, {
    serviceStructureTtlMs: 1000,
    pointsTtlMs: 1000,
    logger: { warn: jest.fn() },
    now: () => now,
  })
  return { catalog, structure, getPoints, advance: (ms: number) => (now += ms) }
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

  it("filters points that do not accept COD", async () => {
    const { catalog } = setup()
    const result = await catalog.searchPoints({ type: "INPOST", cod: true })
    expect(result.map((p) => p.foreign_address_id)).not.toContain("LOD01M")
  })

  it("caches points per type and country", async () => {
    const { catalog, getPoints } = setup()
    await catalog.getPoints("INPOST", "PL")
    await catalog.getPoints("inpost", "pl")
    await catalog.getPoints("INPOST", "CZ")
    expect(getPoints).toHaveBeenCalledTimes(2)
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
    ).toBe("pon–pt 08:00–20:00, sob 09:00–14:00")
    expect(summarizeOpenHours("pn-pt 9-17")).toBe("pn-pt 9-17")
    expect(summarizeOpenHours(null)).toBeNull()
  })
})
