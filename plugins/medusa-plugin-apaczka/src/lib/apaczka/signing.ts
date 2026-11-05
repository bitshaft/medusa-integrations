import { createHmac, timingSafeEqual } from "node:crypto"

import { ApaczkaWebhookError } from "./errors"
import { extractTopLevelValue } from "./json-span"
import type { PushTrackingNotification } from "./types"

/** Apaczka rejects requests whose `expires` is more than 15 minutes ahead. */
export const MAX_REQUEST_TTL_SECONDS = 15 * 60

export type SignedEnvelope = {
  app_id: string
  request: string
  expires: string
  signature: string
}

/**
 * Builds the signed, form-encoded envelope for one API call.
 *
 * String to sign: `app_id:route:request:expires`, HMAC-SHA256 keyed with the
 * app secret, lowercase hex. `route` must include path parameters and the
 * trailing slash (e.g. `waybill/123/`).
 *
 * `request` is serialized once here and the same string is both signed and
 * sent. Re-serializing after signing is the most common cause of
 * "Invalid signature" errors.
 */
export function signRequest(input: {
  appId: string
  appSecret: string
  route: string
  payload: unknown
  /** Unix seconds. Defaults to now + `ttlSeconds`. */
  expires?: number
  ttlSeconds?: number
  now?: () => number
}): SignedEnvelope {
  const ttl = Math.min(input.ttlSeconds ?? MAX_REQUEST_TTL_SECONDS - 60, MAX_REQUEST_TTL_SECONDS)
  const nowSeconds = Math.floor((input.now?.() ?? Date.now()) / 1000)
  const expires = String(input.expires ?? nowSeconds + ttl)
  const request = JSON.stringify(input.payload ?? {})

  const signature = hmacHex(input.appSecret, `${input.appId}:${input.route}:${request}:${expires}`)

  return { app_id: input.appId, request, expires, signature }
}

/**
 * Verifies a push-tracking webhook and returns the parsed notification.
 *
 * Apaczka signs `{app_id}::{json}:` where `{json}` is the `response` object as
 * encoded by PHP (`JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES |
 * JSON_UNESCAPED_LINE_TERMINATORS`). We first check the signature against the
 * raw bytes of `response` from the request body, then against a JavaScript
 * re-encoding, which matches PHP's output for these flags in practice.
 *
 * @throws ApaczkaWebhookError when the body is malformed or the signature does not match.
 */
export function verifyPushTrackingWebhook(input: {
  appId: string
  appSecret: string
  /** The raw request body, exactly as received. */
  rawBody: string | Buffer
}): PushTrackingNotification {
  const raw = typeof input.rawBody === "string" ? input.rawBody : input.rawBody.toString("utf8")

  let parsed: { signature?: unknown; response?: unknown }
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new ApaczkaWebhookError("Webhook body is not valid JSON", { cause: error })
  }

  if (typeof parsed?.signature !== "string" || parsed.signature.length === 0) {
    throw new ApaczkaWebhookError("Webhook body is missing the signature field")
  }
  if (!parsed.response || typeof parsed.response !== "object") {
    throw new ApaczkaWebhookError("Webhook body is missing the response field")
  }

  const candidates = new Set<string>()
  const rawResponse = safeExtract(raw, "response")
  if (rawResponse) {
    candidates.add(rawResponse)
  }
  candidates.add(JSON.stringify(parsed.response))

  const provided = parsed.signature.toLowerCase()
  const matches = [...candidates].some((json) =>
    safeEqualHex(hmacHex(input.appSecret, `${input.appId}::${json}:`), provided)
  )

  if (!matches) {
    throw new ApaczkaWebhookError("Webhook signature does not match")
  }

  return parsed.response as PushTrackingNotification
}

function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex")
}

function safeEqualHex(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(provided, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}

function safeExtract(raw: string, key: string): string | undefined {
  try {
    return extractTopLevelValue(raw, key)
  } catch {
    return undefined
  }
}
