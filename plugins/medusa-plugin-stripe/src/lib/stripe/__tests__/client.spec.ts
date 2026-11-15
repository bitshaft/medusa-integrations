import {
  ALLOWED_PATHS,
  encodeQuery,
  isAllowedPath,
  StripeApiError,
  StripeReadClient,
  StripeReadOnlyError,
} from "../client"
import { describeKey, maskKey } from "../key"

// Built at runtime so the repo secret scanner does not mistake the fixture for a real key.
const KEY = ["rk", "live", "51Habcdefghijklmnopqrstuvwxyz0123456789XyZ9"].join("_")

function client(
  respond: (url: string, init: RequestInit) => { status: number; body: unknown } = () => ({
    status: 200,
    body: { ok: true },
  })
) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const { status, body } = respond(url, init)
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  })
  return {
    stripe: new StripeReadClient({ apiKey: KEY, fetch: fetch as unknown as typeof globalThis.fetch }),
    calls,
    fetch,
  }
}

describe("read-only Stripe client", () => {
  it.each(["POST", "DELETE", "PUT", "PATCH", "post"])("refuses %s before sending anything", async (method) => {
    const { stripe, fetch } = client()
    await expect(stripe.request(method, "/v1/charges")).rejects.toBeInstanceOf(StripeReadOnlyError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    "/v1/refunds/re_123",
    "/v1/payment_intents/pi_123/capture",
    "/v1/payment_intents/pi_123/cancel",
    "/v1/payouts/po_123/cancel",
    "/v1/customers",
    "/v1/charges/../refunds",
    "/v1/charges/ch_1?x=1",
    "/v2/core/events",
    "https://evil.example/v1/balance",
    "",
  ])("refuses the path %s", async (path) => {
    const { stripe, fetch } = client()
    await expect(stripe.get(path)).rejects.toBeInstanceOf(StripeReadOnlyError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("has no allowed path that can move money", () => {
    for (const { path } of ALLOWED_PATHS) expect(path).not.toMatch(/capture|cancel|refund\/|confirm|reverse|close/)
    expect(isAllowedPath("/v1/payment_intents/pi_3Abc")).toBe(true)
    expect(isAllowedPath("/v1/refunds")).toBe(true)
  })

  it("sends a GET with the key only in the Authorization header", async () => {
    const { stripe, calls } = client()
    await stripe.get("/v1/balance_transactions", { payout: "po_1", expand: ["data.source"], created: { gte: 100 } })
    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe("GET")
    expect(calls[0].init.body).toBeUndefined()
    expect(calls[0].url).toBe(
      "https://api.stripe.com/v1/balance_transactions?payout=po_1&expand%5B%5D=data.source&created%5Bgte%5D=100"
    )
    expect(calls[0].url).not.toContain(KEY)
    const headers = new Headers(calls[0].init.headers)
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`)
    expect(headers.get("stripe-version")).toBe("2024-04-10")
  })

  it("masks the key in errors and recognises a bad key and a missing permission", async () => {
    const { stripe } = client((url) =>
      url.includes("account")
        ? {
            status: 403,
            body: {
              error: {
                type: "invalid_request_error",
                message: `The provided key '${KEY}' does not have the required permissions`,
              },
            },
          }
        : {
            status: 401,
            body: { error: { type: "invalid_request_error", message: `Invalid API Key provided: ${KEY}` } },
          }
    )
    const invalid = await stripe.get("/v1/balance").catch((e) => e)
    expect(invalid).toBeInstanceOf(StripeApiError)
    expect(invalid.invalidKey).toBe(true)
    expect(invalid.message).not.toContain(KEY)
    const denied = await stripe.get("/v1/account").catch((e) => e)
    expect(denied.noPermission).toBe(true)
    expect(denied.message).not.toContain(KEY)
  })

  it("encodes Stripe query syntax", () => {
    expect(encodeQuery({ a: 1, b: undefined, c: null, expand: ["x", "y"], created: { gte: 5, lt: 9 } })).toBe(
      "?a=1&expand%5B%5D=x&expand%5B%5D=y&created%5Bgte%5D=5&created%5Blt%5D=9"
    )
    expect(encodeQuery({})).toBe("")
  })
})

describe("key description", () => {
  it("shows only the kind, mode and last four characters", () => {
    expect(describeKey(KEY)).toEqual({ kind: "restricted", mode: "live", last4: "XyZ9" })
    expect(describeKey("sk_test_abcdefghijkl1234")).toEqual({ kind: "secret", mode: "test", last4: "1234" })
    expect(describeKey("pk_live_abcdefghijkl1234")?.kind).toBe("publishable")
    expect(describeKey("whatever123456")).toEqual({ kind: "unknown", mode: "unknown", last4: "3456" })
    expect(describeKey("")).toBeNull()
    expect(maskKey(KEY)).toBe("rk_live_…XyZ9")
    expect(maskKey(KEY)).not.toContain("abcdefgh")
  })
})
