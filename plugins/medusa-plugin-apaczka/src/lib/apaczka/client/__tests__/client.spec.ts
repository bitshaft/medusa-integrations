import { apiError, APP_ID, APP_SECRET, formOf, hmac, mockFetch, ok } from "../../__tests__/fixtures"
import { APACZKA_BASE_URLS, ApaczkaClient, listServices, toArray } from "../client"
import {
  ApaczkaApiError,
  ApaczkaError,
  ApaczkaNetworkError,
  ApaczkaResponseError,
  ApaczkaTimeoutError,
} from "../errors"

function client(fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof ApaczkaClient>[0]> = {}) {
  return new ApaczkaClient({
    appId: APP_ID,
    appSecret: APP_SECRET,
    fetch: fetchImpl,
    retryBaseDelayMs: 1,
    userAgent: "test-agent/1.0",
    ...extra,
  })
}

describe("ApaczkaClient", () => {
  it("requires credentials", () => {
    expect(() => new ApaczkaClient({ appId: "", appSecret: "x" })).toThrow(ApaczkaError)
  })

  it("uses the production URL by default and the sandbox URL on request", () => {
    expect(client(jest.fn()).baseUrl).toBe(APACZKA_BASE_URLS.production)
    expect(client(jest.fn(), { environment: "sandbox" }).baseUrl).toBe(APACZKA_BASE_URLS.sandbox)
    expect(client(jest.fn(), { baseUrl: "https://example.test/api/v2" }).baseUrl).toBe("https://example.test/api/v2/")
  })

  it("posts a signed form envelope and unwraps the response", async () => {
    const { fetch, calls } = mockFetch(ok({ order: { id: 1, waybill_number: "W1" } }))
    const order = await client(fetch).sendOrder({
      service_id: 21,
      address: {
        sender: { name: "S", line1: "a", postal_code: "00-001", city: "W", country_code: "PL" },
        receiver: { name: "R", line1: "b", postal_code: "00-002", city: "W", country_code: "PL" },
      },
      shipment: [{ dimension1: 1, dimension2: 1, dimension3: 1, weight: 1 }],
    })

    expect(order).toEqual({ id: 1, waybill_number: "W1" })
    expect(calls[0].url).toBe(`${APACZKA_BASE_URLS.production}order_send/`)
    expect(calls[0].init.method).toBe("POST")
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded")
    expect(headers["User-Agent"]).toBe("test-agent/1.0")

    const form = formOf(calls[0].init)
    expect(form.app_id).toBe(APP_ID)
    expect(JSON.parse(form.request).order.service_id).toBe(21)
    expect(form.signature).toBe(hmac(`${APP_ID}:order_send/:${form.request}:${form.expires}`))
  })

  it("includes path parameters in the signed route", async () => {
    const { fetch, calls } = mockFetch(ok({ waybill: "QUJD", type: "pdf" }))
    await client(fetch).getWaybill(42)
    const form = formOf(calls[0].init)
    expect(calls[0].url).toMatch(/waybill\/42\/$/)
    expect(form.signature).toBe(hmac(`${APP_ID}:waybill/42/:{}:${form.expires}`))
  })

  it("throws ApaczkaApiError when the envelope status is not 200", async () => {
    const { fetch } = mockFetch(apiError(400, "Invalid signature"))
    const error = await client(fetch)
      .getServiceStructure()
      .catch((e) => e)
    expect(error).toBeInstanceOf(ApaczkaApiError)
    expect(error.status).toBe(400)
    expect(error.message).toBe("Invalid signature")
    expect(error.route).toBe("service_structure/")
    expect(error.isAuthenticationError).toBe(true)
  })

  it("does not retry envelope errors", async () => {
    const { fetch } = mockFetch(apiError(422, "Bad postal code"))
    await expect(client(fetch).getServiceStructure()).rejects.toThrow("Bad postal code")
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("retries read calls on network errors and HTTP 5xx", async () => {
    const { fetch } = mockFetch(
      new TypeError("socket hang up"),
      { status: 502, body: "<html>Bad gateway</html>" },
      ok({ services: [] })
    )
    await expect(client(fetch).getServiceStructure()).resolves.toEqual({ services: [] })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it("gives up after maxRetries", async () => {
    const { fetch } = mockFetch(new TypeError("down"), new TypeError("down"))
    await expect(client(fetch, { maxRetries: 1 }).getServiceStructure()).rejects.toBeInstanceOf(ApaczkaNetworkError)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    ["sendOrder", (c: ApaczkaClient) => c.sendOrder({} as never)],
    ["cancelOrder", (c: ApaczkaClient) => c.cancelOrder(1)],
    [
      "orderPickup",
      (c: ApaczkaClient) => c.orderPickup(1, { date: "2026-01-01", hour_from: "09:00", hour_to: "12:00" }),
    ],
    [
      "batchPickup",
      (c: ApaczkaClient) => c.batchPickup({ order_ids: [1], date: "2026-01-01", hour_from: "09:00", hour_to: "12:00" }),
    ],
  ])("never retries %s (not idempotent)", async (_name, call) => {
    const { fetch } = mockFetch(new TypeError("timeout-ish"), ok({}))
    await expect(call(client(fetch))).rejects.toBeInstanceOf(ApaczkaNetworkError)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("throws ApaczkaResponseError for non-JSON bodies", async () => {
    const { fetch } = mockFetch({ status: 200, body: "not json" })
    await expect(client(fetch, { maxRetries: 0 }).getServiceStructure()).rejects.toBeInstanceOf(ApaczkaResponseError)
  })

  it("throws ApaczkaResponseError when the envelope has no status", async () => {
    const { fetch } = mockFetch({ body: { hello: "world" } })
    await expect(client(fetch, { maxRetries: 0 }).getServiceStructure()).rejects.toBeInstanceOf(ApaczkaResponseError)
  })

  it("times out slow requests", async () => {
    const slow = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        })
    ) as unknown as typeof fetch
    const error = await client(slow, { timeoutMs: 20, maxRetries: 0 })
      .getServiceStructure()
      .catch((e) => e)
    expect(error).toBeInstanceOf(ApaczkaTimeoutError)
    expect(error.timeoutMs).toBe(20)
  })

  it("rejects routes without a trailing slash", async () => {
    await expect(client(jest.fn()).call("order_send", {}, { idempotent: false })).rejects.toThrow("trailing slash")
  })

  it("normalizes list-like objects to arrays", async () => {
    const { fetch } = mockFetch(
      ok({ points: { "1": { foreign_address_id: "A" }, "2": { foreign_address_id: "B" } } }),
      ok({ postal_code: "00-001", hours: { "2026-07-21": { date: "2026-07-21", services: {} } } }),
      ok({ data: [{ status: "NEW", updated_at: "2026-07-21T08:00:00+00:00" }], service: "DPD" })
    )
    const c = client(fetch)
    expect((await c.getPoints("INPOST")).map((p) => p.foreign_address_id)).toEqual(["A", "B"])
    expect((await c.getPickupHours({ postal_code: "00-001", service_id: 21 })).days).toHaveLength(1)
    expect((await c.getTracking("W 1")).data).toHaveLength(1)
  })

  it("caps the order list page size at 25", async () => {
    const { fetch, calls } = mockFetch(ok({ orders: [] }))
    await client(fetch).listOrders({ limit: 100 })
    expect(JSON.parse(formOf(calls[0].init).request)).toEqual({ page: 1, limit: 25 })
  })

  it("sends numeric order IDs for turn-in documents", async () => {
    const { fetch, calls } = mockFetch(ok({ turn_in: "QUJD" }))
    await client(fetch).getTurnIn(["1", 2])
    expect(JSON.parse(formOf(calls[0].init).request)).toEqual({ order_ids: [1, 2] })
  })
})

describe("helpers", () => {
  it("toArray handles arrays, objects and empty values", () => {
    expect(toArray([1, 2])).toEqual([1, 2])
    expect(toArray({ a: 1, b: 2 })).toEqual([1, 2])
    expect(toArray(null)).toEqual([])
  })

  it("listServices coerces service IDs to numbers", () => {
    expect(listServices({ services: { "0": { service_id: "21", name: "x", supplier: "DPD" } } })[0].service_id).toBe(21)
  })
})
