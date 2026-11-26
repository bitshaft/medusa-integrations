import { inspect } from "node:util"

import { ApaczkaClient } from "../client"
import { createApaczkaClient, pointSource, withoutDemoCredentials } from "../client-factory"
import { parseOptions } from "../options"
import { APP_ID, APP_SECRET, mockFetch, ok, options } from "./fixtures"

describe("livePoints option", () => {
  it("needs real credentials in demo mode", () => {
    const result = parseOptions({ demo: true, livePoints: true })
    expect(result.enabled).toBe(false)
    expect(!result.enabled && result.reason).toMatch(/appId/)
  })

  it("keeps the credentials in demo mode with livePoints", () => {
    const result = parseOptions({ demo: true, livePoints: true, appId: APP_ID, appSecret: APP_SECRET })
    expect(result.enabled && result.options).toMatchObject({ demo: true, livePoints: true, appId: APP_ID })
  })

  it("leaves plain demo mode without credentials", () => {
    const result = parseOptions({ demo: true })
    expect(result.enabled && result.options).toMatchObject({ demo: true, livePoints: false, appId: "demo" })
  })
})

describe("createApaczkaClient with demo and livePoints", () => {
  afterEach(() => jest.restoreAllMocks())

  it("sends only the points request to Apaczka", async () => {
    const { fetch, calls } = mockFetch(ok({ points: { WAW41N: { foreign_address_id: "WAW41N", type: "INPOST" } } }))
    jest.spyOn(globalThis, "fetch").mockImplementation(fetch as unknown as typeof globalThis.fetch)

    const client = createApaczkaClient(options({ demo: true, livePoints: true }))
    expect(client.demo).toBe(true)
    expect(client.livePoints).toBe(true)

    // Everything else is answered by the demo client.
    expect((await client.getServiceStructure()).services).toBeDefined()
    await client.cancelOrder(1).catch(() => undefined)
    expect(calls).toHaveLength(0)

    const points = await client.getPoints("INPOST")
    expect(points.map((p) => p.foreign_address_id)).toEqual(["WAW41N"])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://www.apaczka.pl/api/v2/points/INPOST/")
  })

  it("keeps sample points without livePoints", async () => {
    const fetch = jest.spyOn(globalThis, "fetch")
    const client = createApaczkaClient(options({ demo: true }))
    expect(client.livePoints).toBe(false)
    expect((await client.getPoints("INPOST")).length).toBeGreaterThan(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe("pointSource", () => {
  it("tells demo samples from live lists", () => {
    expect(pointSource(options({ demo: true }))).toBe("demo")
    expect(pointSource(options({ demo: true, livePoints: true }))).toBe("production")
    expect(pointSource(options({ environment: "sandbox" }))).toBe("sandbox")
  })
})

describe("keys in demo mode with livePoints", () => {
  /** Everything a log line or a response could print from the object. */
  const printed = (value: unknown) => inspect(value, { depth: Infinity, showHidden: true })

  it("are not reachable from the demo client", () => {
    // The real client does hold them, so the check would see a key.
    expect(printed(createApaczkaClient(options()))).toContain(APP_SECRET)

    const client = createApaczkaClient(options({ demo: true, livePoints: true }))
    expect(printed(client)).not.toContain(APP_SECRET)
    expect(Object.values(client).some((value) => value instanceof ApaczkaClient && !value.demo)).toBe(false)
  })

  it("are replaced with placeholders in the options the plugin keeps", () => {
    expect(withoutDemoCredentials(options({ demo: true, livePoints: true }))).toMatchObject({
      demo: true,
      livePoints: true,
      appId: "demo",
      appSecret: "demo",
    })
    expect(withoutDemoCredentials(options())).toMatchObject({ appId: APP_ID, appSecret: APP_SECRET })
  })
})
