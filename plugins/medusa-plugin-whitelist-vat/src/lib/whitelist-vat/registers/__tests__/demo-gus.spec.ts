import { isValidNip, isValidRegon } from "../../identifiers"
import { parseOptions } from "../../options"
import { decideStatus, toSourceState } from "../../verdict"
import { DEMO_GUS_NIPS, DemoGusClient, demoCompany } from "../demo-gus"

const NOW = Date.parse("2026-11-18T10:00:00.000Z")

describe("DemoGusClient", () => {
  const client = new DemoGusClient({ now: () => NOW })

  it("finds any NIP with a sample business and a valid REGON, without a request", async () => {
    const fetch = jest.spyOn(globalThis, "fetch")
    const result = await client.searchNip("5260250274")

    expect(fetch).not.toHaveBeenCalled()
    expect(result).toMatchObject({ source: "gus", outcome: "found", error: null })
    expect(result.request_id).toMatch(/^demo-5260250274-/)
    expect(result.company?.name).toMatch(/^\[DEMO\] /)
    expect(result.company?.address).toBe(
      `${result.company?.street}, ${result.company?.postal_code} ${result.company?.city}`
    )
    expect(isValidRegon(result.company!.regon!)).toBe(true)
    fetch.mockRestore()
  })

  it("gives the same NIP the same business", () => {
    expect(demoCompany("1234563218")).toEqual(demoCompany("1234563218"))
  })

  it("has fixed answers for a closed business and an unknown number", async () => {
    expect(isValidNip(DEMO_GUS_NIPS.inactive)).toBe(true)
    expect(isValidNip(DEMO_GUS_NIPS.notFound)).toBe(true)

    const closed = await client.searchNip(DEMO_GUS_NIPS.inactive)
    expect(closed.outcome).toBe("inactive")
    expect(closed.company?.name).toMatch(/^\[DEMO\] /)
    expect((await client.searchNip(DEMO_GUS_NIPS.notFound)).outcome).toBe("not_found")
  })

  it("is used by the verdict like the real GUS", async () => {
    const closed = await client.searchNip(DEMO_GUS_NIPS.inactive)
    expect(decideStatus({ gus: toSourceState(closed) })).toBe("inactive")
  })
})

describe("demo option", () => {
  it("is off by default and needs no GUS key when on", () => {
    const off = parseOptions({})
    const on = parseOptions({ demo: true })
    expect(off.enabled && off.options.demo).toBe(false)
    expect(on.enabled && on.options.demo).toBe(true)
  })
})
