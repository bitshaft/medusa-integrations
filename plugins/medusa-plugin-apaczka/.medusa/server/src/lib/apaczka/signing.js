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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lnbmluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9saWIvYXBhY3prYS9zaWduaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQTJCQSxrQ0FxQkM7QUFhRCw4REF1Q0M7QUFwR0QsNkNBQXlEO0FBRXpELHFDQUE4QztBQUM5QywyQ0FBa0Q7QUFHbEQsOEVBQThFO0FBQ2pFLFFBQUEsdUJBQXVCLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQTtBQVM5Qzs7Ozs7Ozs7OztHQVVHO0FBQ0gsU0FBZ0IsV0FBVyxDQUFDLEtBUzNCO0lBQ0MsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxJQUFJLCtCQUF1QixHQUFHLEVBQUUsRUFBRSwrQkFBdUIsQ0FBQyxDQUFBO0lBQy9GLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQTtJQUNuRSxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sSUFBSSxVQUFVLEdBQUcsR0FBRyxDQUFDLENBQUE7SUFDekQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFBO0lBRW5ELE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FDdkIsS0FBSyxDQUFDLFNBQVMsRUFDZixHQUFHLEtBQUssQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLEtBQUssSUFBSSxPQUFPLElBQUksT0FBTyxFQUFFLENBQ3RELENBQUE7SUFFRCxPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsQ0FBQTtBQUM3RCxDQUFDO0FBRUQ7Ozs7Ozs7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