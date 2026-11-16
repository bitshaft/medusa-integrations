import { APP_ID, APP_SECRET, hmac } from "../../__tests__/fixtures"
import { ApaczkaWebhookError } from "../errors"
import { extractTopLevelValue } from "../json-span"
import { MAX_REQUEST_TTL_SECONDS, signRequest, verifyPushTrackingWebhook } from "../signing"

describe("signRequest", () => {
  it("signs app_id:route:request:expires with HMAC-SHA256", () => {
    const envelope = signRequest({
      appId: APP_ID,
      appSecret: APP_SECRET,
      route: "order_send/",
      payload: { order: { service_id: 21 } },
      expires: 1752994800,
    })

    expect(envelope.request).toBe('{"order":{"service_id":21}}')
    expect(envelope.expires).toBe("1752994800")
    expect(envelope.signature).toBe(hmac(`${APP_ID}:order_send/:{"order":{"service_id":21}}:1752994800`))
    expect(envelope.signature).toMatch(/^[0-9a-f]{64}$/)
  })

  it("sends exactly the string it signs", () => {
    const envelope = signRequest({ appId: APP_ID, appSecret: APP_SECRET, route: "x/", payload: { b: 1, a: "ż/" } })
    expect(envelope.signature).toBe(hmac(`${APP_ID}:x/:${envelope.request}:${envelope.expires}`))
  })

  it("never sets expires more than 15 minutes ahead", () => {
    const now = 1_700_000_000_000
    const envelope = signRequest({
      appId: APP_ID,
      appSecret: APP_SECRET,
      route: "x/",
      payload: {},
      ttlSeconds: 3600,
      now: () => now,
    })
    expect(Number(envelope.expires) - now / 1000).toBeLessThanOrEqual(MAX_REQUEST_TTL_SECONDS)
  })

  it("sends {} for an empty payload", () => {
    expect(signRequest({ appId: APP_ID, appSecret: APP_SECRET, route: "x/", payload: undefined }).request).toBe("{}")
  })
})

describe("verifyPushTrackingWebhook", () => {
  const response = {
    orderNumber: "123456789",
    statuses: [{ status: "ON_THE_WAY", updatedAt: "2026-10-06T00:45:00", trackingOperatorStatuses: [] }],
  }

  const signed = (json: string) => hmac(`${APP_ID}::${json}:`)

  it("accepts a correctly signed notification", () => {
    const json = JSON.stringify(response)
    const body = JSON.stringify({ signature: signed(json), response })
    expect(verifyPushTrackingWebhook({ appId: APP_ID, appSecret: APP_SECRET, rawBody: body })).toEqual(response)
  })

  it("accepts a Buffer body", () => {
    const json = JSON.stringify(response)
    const body = Buffer.from(JSON.stringify({ signature: signed(json), response }))
    expect(verifyPushTrackingWebhook({ appId: APP_ID, appSecret: APP_SECRET, rawBody: body }).orderNumber).toBe(
      "123456789"
    )
  })

  it("verifies against the raw bytes when PHP encoded them differently", () => {
    // PHP keeps `1.0`; JSON.stringify would turn it into `1`.
    const rawResponse = '{"orderNumber":"1","statuses":[],"weight":1.0}'
    const body = `{"signature":"${signed(rawResponse)}","response":${rawResponse}}`
    expect(() => verifyPushTrackingWebhook({ appId: APP_ID, appSecret: APP_SECRET, rawBody: body })).not.toThrow()
  })

  it("acts only on the bytes it verified, never on a second response key", () => {
    // A genuine notification (e.g. a captured one) with a forged one appended
    // under the same key: JSON.parse keeps the last, the signature covers the first.
    const genuine = JSON.stringify(response)
    const forged = JSON.stringify({ orderNumber: "999", statuses: [{ status: "DELIVERED", updatedAt: "x" }] })
    const body = `{"signature":"${signed(genuine)}","response":${genuine},"response":${forged}}`
    let result: unknown
    try {
      result = verifyPushTrackingWebhook({ appId: APP_ID, appSecret: APP_SECRET, rawBody: body })
    } catch (error) {
      expect(error).toBeInstanceOf(ApaczkaWebhookError)
      return
    }
    expect(result).toEqual(response)
  })

  it("rejects a body with more than one signature or response", () => {
    const json = JSON.stringify(response)
    const twice = `{"signature":"${signed(json)}","response":${json},"response":${json}}`
    const twoSignatures = `{"signature":"bad","signature":"${signed(json)}","response":${json}}`
    for (const body of [twice, twoSignatures]) {
      expect(() => verifyPushTrackingWebhook({ appId: APP_ID, appSecret: APP_SECRET, rawBody: body })).toThrow(
        /more than once/
      )
    }
  })

  it("rejects a tampered payload", () => {
    const json = JSON.stringify(response)
    const tampered = { ...response, orderNumber: "999" }
    const body = JSON.stringify({ signature: signed(json), response: tampered })
    expect(() => verifyPushTrackingWebhook({ appId: APP_ID, appSecret: APP_SECRET, rawBody: body })).toThrow(
      ApaczkaWebhookError
    )
  })

  it("rejects a signature made with another secret", () => {
    const json = JSON.stringify(response)
    const body = JSON.stringify({ signature: hmac(`${APP_ID}::${json}:`, "other"), response })
    expect(() => verifyPushTrackingWebhook({ appId: APP_ID, appSecret: APP_SECRET, rawBody: body })).toThrow(
      "does not match"
    )
  })

  it.each([
    ["not json", "nope"],
    ["missing signature", JSON.stringify({ response })],
    ["missing response", JSON.stringify({ signature: "abc" })],
  ])("rejects a body with %s", (_label, body) => {
    expect(() => verifyPushTrackingWebhook({ appId: APP_ID, appSecret: APP_SECRET, rawBody: body })).toThrow(
      ApaczkaWebhookError
    )
  })
})

describe("extractTopLevelValue", () => {
  it("returns the exact source text of a value", () => {
    const json = '{ "a" : 1, "response" : {"x":"a,b}","y":[1, 2.0]} , "z": null }'
    expect(extractTopLevelValue(json, "response")).toBe('{"x":"a,b}","y":[1, 2.0]}')
    expect(extractTopLevelValue(json, "a")).toBe("1")
    expect(extractTopLevelValue(json, "z")).toBe("null")
  })

  it("handles escaped quotes in strings", () => {
    expect(extractTopLevelValue('{"k":"say \\"hi\\"","v":true}', "v")).toBe("true")
  })

  it("ignores nested keys with the same name", () => {
    expect(extractTopLevelValue('{"outer":{"response":1},"response":2}', "response")).toBe("2")
  })

  it("returns undefined for missing keys and non-objects", () => {
    expect(extractTopLevelValue('{"a":1}', "b")).toBeUndefined()
    expect(extractTopLevelValue("[1,2]", "a")).toBeUndefined()
  })
})
