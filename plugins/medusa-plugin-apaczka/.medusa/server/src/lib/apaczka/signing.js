"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_REQUEST_TTL_SECONDS = void 0;
exports.signRequest = signRequest;
exports.verifyPushTrackingWebhook = verifyPushTrackingWebhook;
const node_crypto_1 = require("node:crypto");
const errors_1 = require("./errors");
const json_span_1 = require("./json-span");
/** Apaczka rejects requests whose `expires` is more than 15 minutes ahead. */
exports.MAX_REQUEST_TTL_SECONDS = 15 * 60;
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
function signRequest(input) {
    const ttl = Math.min(input.ttlSeconds ?? exports.MAX_REQUEST_TTL_SECONDS - 60, exports.MAX_REQUEST_TTL_SECONDS);
    const nowSeconds = Math.floor((input.now?.() ?? Date.now()) / 1000);
    const expires = String(input.expires ?? nowSeconds + ttl);
    const request = JSON.stringify(input.payload ?? {});
    const signature = hmacHex(input.appSecret, `${input.appId}:${input.route}:${request}:${expires}`);
    return { app_id: input.appId, request, expires, signature };
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
function verifyPushTrackingWebhook(input) {
    const raw = typeof input.rawBody === "string" ? input.rawBody : input.rawBody.toString("utf8");
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new errors_1.ApaczkaWebhookError("Webhook body is not valid JSON", { cause: error });
    }
    if (typeof parsed?.signature !== "string" || parsed.signature.length === 0) {
        throw new errors_1.ApaczkaWebhookError("Webhook body is missing the signature field");
    }
    if (!parsed.response || typeof parsed.response !== "object") {
        throw new errors_1.ApaczkaWebhookError("Webhook body is missing the response field");
    }
    const candidates = new Set();
    const rawResponse = safeExtract(raw, "response");
    if (rawResponse) {
        candidates.add(rawResponse);
    }
    candidates.add(JSON.stringify(parsed.response));
    const provided = parsed.signature.toLowerCase();
    const matches = [...candidates].some((json) => safeEqualHex(hmacHex(input.appSecret, `${input.appId}::${json}:`), provided));
    if (!matches) {
        throw new errors_1.ApaczkaWebhookError("Webhook signature does not match");
    }
    return parsed.response;
}
function hmacHex(secret, data) {
    return (0, node_crypto_1.createHmac)("sha256", secret).update(data, "utf8").digest("hex");
}
function safeEqualHex(expected, provided) {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    return a.length === b.length && (0, node_crypto_1.timingSafeEqual)(a, b);
}
function safeExtract(raw, key) {
    try {
        return (0, json_span_1.extractTopLevelValue)(raw, key);
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lnbmluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9saWIvYXBhY3prYS9zaWduaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQTJCQSxrQ0FrQkM7QUFhRCw4REF1Q0M7QUFqR0QsNkNBQXlEO0FBRXpELHFDQUE4QztBQUM5QywyQ0FBa0Q7QUFHbEQsOEVBQThFO0FBQ2pFLFFBQUEsdUJBQXVCLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQTtBQVM5Qzs7Ozs7Ozs7OztHQVVHO0FBQ0gsU0FBZ0IsV0FBVyxDQUFDLEtBUzNCO0lBQ0MsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxJQUFJLCtCQUF1QixHQUFHLEVBQUUsRUFBRSwrQkFBdUIsQ0FBQyxDQUFBO0lBQy9GLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQTtJQUNuRSxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sSUFBSSxVQUFVLEdBQUcsR0FBRyxDQUFDLENBQUE7SUFDekQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFBO0lBRW5ELE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsS0FBSyxJQUFJLE9BQU8sSUFBSSxPQUFPLEVBQUUsQ0FBQyxDQUFBO0lBRWpHLE9BQU8sRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxDQUFBO0FBQzdELENBQUM7QUFFRDs7Ozs7Ozs7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