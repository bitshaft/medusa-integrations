import type { ApaczkaPoint } from "../client"
import { fromPointRow, normalizeSearch, toPointRow } from "../point-rows"

// Shape taken from a real production `points/INPOST/` response.
const real: ApaczkaPoint = {
  type: "INPOST",
  subtype: "parcel_locker",
  name: "Przy sklepie Lewiatan",
  foreign_address_id: "ADA01M",
  address: {
    line1: "Kościuszki 27",
    line2: null as unknown as string,
    street: "Kościuszki",
    house_number: "27",
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
}

const context = { type: "INPOST", countryCode: "PL", syncedAt: new Date("2026-11-25T10:00:00Z") }

describe("toPointRow", () => {
  it("maps a real InPost point", () => {
    const row = toPointRow(real, context)!
    expect(row).toMatchObject({
      type: "INPOST",
      country_code: "PL",
      external_id: "ADA01M",
      name: "Przy sklepie Lewiatan",
      line1: "Kościuszki 27",
      line2: null,
      postal_code: "21-412",
      city: "Adamów",
      latitude: 51.73834,
      longitude: 22.26405,
      open_hours_summary: "24/7",
      accepts_cod: true,
      accepts_delivery: true,
      image_url: null,
      additional_info: null,
      synced_at: context.syncedAt,
    })
    expect(row.id).toMatch(/^apzpt_/)
    expect(JSON.parse(row.open_hours as string)).toEqual(real.open_hours)
  })

  it("builds the search text without diacritics", () => {
    expect(toPointRow(real, context)!.search).toBe("ada01m przy sklepie lewiatan kosciuszki 27 adamow 21-412")
    expect(normalizeSearch("Łódź Żabka")).toBe("lodz zabka")
  })

  it("skips points without an ID and keeps points without a location", () => {
    expect(toPointRow({ ...real, foreign_address_id: "" }, context)).toBeNull()
    const row = toPointRow({ ...real, address: { ...real.address, latitude: "", longitude: "" } }, context)!
    expect(row.latitude).toBeNull()
    expect(row.longitude).toBeNull()
  })

  it("treats a missing COD flag as accepted, like the store API", () => {
    expect(toPointRow({ ...real, option_cod: undefined }, context)!.accepts_cod).toBe(true)
    expect(toPointRow({ ...real, option_cod: false }, context)!.accepts_cod).toBe(false)
  })
})

describe("fromPointRow", () => {
  it("gives back the point in Apaczka's shape", () => {
    const row = toPointRow(real, context)!
    const point = fromPointRow({ ...row, open_hours: JSON.parse(row.open_hours as string) })
    expect(point).toMatchObject({
      type: "INPOST",
      foreign_address_id: "ADA01M",
      name: "Przy sklepie Lewiatan",
      address: { line1: "Kościuszki 27", city: "Adamów", latitude: "51.73834", longitude: "22.26405" },
      open_hours: real.open_hours,
      option_cod: true,
      option_deliver: true,
    })
    expect(point.address).not.toHaveProperty("line2")
  })

  it("keeps opening hours sent as text", () => {
    const row = toPointRow({ ...real, open_hours: "pn-pt 9-17" }, context)!
    expect(fromPointRow({ ...row, open_hours: JSON.parse(row.open_hours as string) }).open_hours).toBe("pn-pt 9-17")
    expect(row.open_hours_summary).toBe("pn-pt 9-17")
  })
})
