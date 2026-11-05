"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApaczkaClient = exports.APACZKA_BASE_URLS = void 0;
exports.toArray = toArray;
exports.listServices = listServices;
const errors_1 = require("./errors");
const signing_1 = require("./signing");
exports.APACZKA_BASE_URLS = {
    production: "https://www.apaczka.pl/api/v2/",
    sandbox: "https://panel-sandbox.apaczka.pl/api/v2/",
};
/**
 * Typed client for the Apaczka API v2.
 *
 * Handles HMAC request signing, the "HTTP 200 for everything" envelope,
 * timeouts and safe retries. It has no Medusa dependencies and can be used
 * on its own.
 */
class ApaczkaClient {
    baseUrl;
    environment;
    appId;
    appSecret;
    timeoutMs;
    maxRetries;
    retryBaseDelayMs;
    userAgent;
    logger;
    fetchImpl;
    now;
    constructor(options) {
        if (!options.appId || !options.appSecret) {
            throw new errors_1.ApaczkaError("Apaczka appId and appSecret are required");
        }
        this.appId = options.appId;
        this.appSecret = options.appSecret;
        this.environment = options.baseUrl ? "custom" : (options.environment ?? "production");
        this.baseUrl = normalizeBaseUrl(options.baseUrl ?? exports.APACZKA_BASE_URLS[options.environment ?? "production"]);
        this.timeoutMs = options.timeoutMs ?? 15_000;
        this.maxRetries = Math.max(0, options.maxRetries ?? 2);
        this.retryBaseDelayMs = options.retryBaseDelayMs ?? 300;
        this.userAgent = options.userAgent ?? "apaczka-node-client";
        this.logger = options.logger;
        this.fetchImpl = options.fetch ?? globalThis.fetch;
        this.now = options.now ?? Date.now;
        if (typeof this.fetchImpl !== "function") {
            throw new errors_1.ApaczkaError("No fetch implementation available (Node.js 18+ is required)");
        }
    }
    /* ---------------------------------------------------------------------- */
    /* Dictionary                                                              */
    /* ---------------------------------------------------------------------- */
    /** Services, options, package types and pickup types available to the account. */
    getServiceStructure(signal) {
        return this.call("service_structure/", {}, { idempotent: true, signal });
    }
    /** Parcel points (lockers, PUDO) of one type, e.g. `INPOST`. */
    async getPoints(type, payload = {}, signal) {
        const response = await this.call(`points/${encodeURIComponent(type)}/`, { country_code: "PL", subtype: "", ...payload }, { idempotent: true, signal });
        return toArray(response?.points);
    }
    /* ---------------------------------------------------------------------- */
    /* Orders                                                                  */
    /* ---------------------------------------------------------------------- */
    /**
     * Prices an order without creating it. Omit `service_id` to price across
     * every service able to carry the parcel. Amounts are in grosze.
     */
    valuateOrder(order, signal) {
        return this.call("order_valuation/", { order }, { idempotent: true, signal });
    }
    /**
     * Creates a shipment order. Not idempotent and never retried — on a
     * timeout, check `listOrders` before trying again.
     */
    async sendOrder(order, signal) {
        const response = await this.call("order_send/", { order }, { idempotent: false, signal });
        return response.order;
    }
    async getOrder(orderId, signal) {
        const response = await this.call(`order/${orderId}/`, {}, { idempotent: true, signal });
        return response.order;
    }
    /** Paginated order list (the API allows at most 25 per page). */
    async listOrders(payload = {}, signal) {
        const response = await this.call("orders/", { page: payload.page ?? 1, limit: Math.min(payload.limit ?? 25, 25) }, { idempotent: true, signal });
        return toArray(response?.orders);
    }
    /** Cancels an order while the carrier has not taken over the parcel yet. */
    async cancelOrder(orderId, signal) {
        await this.call(`cancel_order/${orderId}/`, {}, { idempotent: false, signal });
    }
    /* ---------------------------------------------------------------------- */
    /* Documents                                                               */
    /* ---------------------------------------------------------------------- */
    /** Shipping label, base64-encoded (PDF, or ZPL when ordered with `is_zebra`). */
    getWaybill(orderId, signal) {
        return this.call(`waybill/${orderId}/`, {}, { idempotent: true, signal });
    }
    /** Drop-off code some carriers require at the point. `dispatch_code` may be null. */
    getDispatchCode(orderId, signal) {
        return this.call(`dispatch_code/${orderId}/`, {}, { idempotent: true, signal });
    }
    /** Collective hand-over (turn-in) confirmation for several orders, base64 PDF. */
    getTurnIn(orderIds, signal) {
        return this.call("turn_in/", { order_ids: orderIds.map(Number) }, { idempotent: true, signal });
    }
    /* ---------------------------------------------------------------------- */
    /* Pickups                                                                 */
    /* ---------------------------------------------------------------------- */
    /** Available courier pickup days for a postal code and service. */
    async getPickupHours(payload, signal) {
        const response = await this.call("pickup_hours/", payload, { idempotent: true, signal });
        return { postal_code: response.postal_code, days: toArray(response.hours) };
    }
    /** Orders a courier pickup for an existing order (needs the "pickup via API" privilege). */
    orderPickup(orderId, payload, signal) {
        return this.call(`pickup/${orderId}/`, payload, { idempotent: false, signal });
    }
    /** One courier pickup for several orders with the same sender and service. */
    batchPickup(payload, signal) {
        return this.call("batch_pickup/", { ...payload, order_ids: payload.order_ids.map(Number) }, { idempotent: false, signal });
    }
    /* ---------------------------------------------------------------------- */
    /* Tracking                                                                */
    /* ---------------------------------------------------------------------- */
    /** Tracking history by carrier waybill number, newest first. */
    async getTracking(waybillNumber, signal) {
        const response = await this.call(`tracking/${encodeURIComponent(waybillNumber)}/`, {}, { idempotent: true, signal });
        return { ...response, data: toArray(response?.data) };
    }
    /* ---------------------------------------------------------------------- */
    /* Transport                                                               */
    /* ---------------------------------------------------------------------- */
    /**
     * Signs and sends one call, unwraps the envelope and applies the retry
     * policy. Public so new API methods can be used before this client
     * wraps them.
     */
    async call(route, payload, options) {
        if (!route.endsWith("/")) {
            // The server signs with the trailing slash; without it every call fails.
            throw new errors_1.ApaczkaError(`Route "${route}" must end with a trailing slash`, { route });
        }
        const attempts = options.idempotent ? this.maxRetries + 1 : 1;
        let lastError;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return await this.send(route, payload, options.signal);
            }
            catch (error) {
                lastError = error;
                if (attempt >= attempts || !isRetryable(error) || options.signal?.aborted) {
                    throw error;
                }
                const delay = backoff(this.retryBaseDelayMs, attempt);
                this.logger?.warn(`[apaczka] ${route} failed (${error.message}); retry ${attempt}/${attempts - 1} in ${delay} ms`);
                await sleep(delay);
            }
        }
        throw lastError;
    }
    async send(route, payload, signal) {
        const envelope = (0, signing_1.signRequest)({
            appId: this.appId,
            appSecret: this.appSecret,
            route,
            payload,
            now: this.now,
        });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const onAbort = () => controller.abort();
        signal?.addEventListener("abort", onAbort, { once: true });
        const startedAt = this.now();
        let httpResponse;
        try {
            httpResponse = await this.fetchImpl(this.baseUrl + route, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                    "User-Agent": this.userAgent,
                },
                body: new URLSearchParams(envelope).toString(),
                signal: controller.signal,
            });
        }
        catch (error) {
            if (controller.signal.aborted && !signal?.aborted) {
                throw new errors_1.ApaczkaTimeoutError(route, this.timeoutMs);
            }
            throw new errors_1.ApaczkaNetworkError(`Apaczka request to ${route} failed: ${error.message}`, {
                route,
                cause: error,
            });
        }
        finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        }
        const text = await httpResponse.text();
        this.logger?.debug?.(`[apaczka] POST ${route} -> HTTP ${httpResponse.status} in ${this.now() - startedAt} ms`);
        let body;
        try {
            body = JSON.parse(text);
        }
        catch (error) {
            throw new errors_1.ApaczkaResponseError(route, httpResponse.status, text, error);
        }
        if (!body || typeof body !== "object" || typeof body.status !== "number") {
            throw new errors_1.ApaczkaResponseError(route, httpResponse.status, text);
        }
        if (body.status !== 200) {
            throw new errors_1.ApaczkaApiError(body.status, body.message, route);
        }
        return body.response;
    }
}
exports.ApaczkaClient = ApaczkaClient;
/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */
/** The API returns some lists as objects keyed by index; normalize to arrays. */
function toArray(value) {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value : Object.values(value);
}
/** Services from `service_structure`, with `service_id` coerced to a number. */
function listServices(structure) {
    return toArray(structure.services).map((service) => ({
        ...service,
        service_id: Number(service.service_id),
    }));
}
function normalizeBaseUrl(url) {
    return url.endsWith("/") ? url : `${url}/`;
}
function isRetryable(error) {
    if (error instanceof errors_1.ApaczkaNetworkError) {
        return true;
    }
    if (error instanceof errors_1.ApaczkaResponseError) {
        return error.httpStatus >= 500 || error.httpStatus === 429;
    }
    // Envelope errors are deterministic (validation, auth) — retrying won't help.
    return false;
}
function backoff(baseMs, attempt) {
    const exponential = baseMs * 2 ** (attempt - 1);
    return Math.round(exponential / 2 + Math.random() * (exponential / 2));
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL2xpYi9hcGFjemthL2NsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUF1WEEsMEJBS0M7QUFHRCxvQ0FLQztBQXBZRCxxQ0FNaUI7QUFDakIsdUNBQXVDO0FBMEIxQixRQUFBLGlCQUFpQixHQUF1QztJQUNuRSxVQUFVLEVBQUUsZ0NBQWdDO0lBQzVDLE9BQU8sRUFBRSwwQ0FBMEM7Q0FDcEQsQ0FBQTtBQXlDRDs7Ozs7O0dBTUc7QUFDSCxNQUFhLGFBQWE7SUFDZixPQUFPLENBQVE7SUFDZixXQUFXLENBQStCO0lBRWxDLEtBQUssQ0FBUTtJQUNiLFNBQVMsQ0FBUTtJQUNqQixTQUFTLENBQVE7SUFDakIsVUFBVSxDQUFRO0lBQ2xCLGdCQUFnQixDQUFRO0lBQ3hCLFNBQVMsQ0FBUTtJQUNqQixNQUFNLENBQWdCO0lBQ3RCLFNBQVMsQ0FBYztJQUN2QixHQUFHLENBQWM7SUFFbEMsWUFBWSxPQUE2QjtRQUN2QyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN6QyxNQUFNLElBQUkscUJBQVksQ0FBQywwQ0FBMEMsQ0FBQyxDQUFBO1FBQ3BFLENBQUM7UUFFRCxJQUFJLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUE7UUFDMUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxXQUFXLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLElBQUksWUFBWSxDQUFDLENBQUE7UUFDckYsSUFBSSxDQUFDLE9BQU8sR0FBRyxnQkFBZ0IsQ0FDN0IsT0FBTyxDQUFDLE9BQU8sSUFBSSx5QkFBaUIsQ0FBQyxPQUFPLENBQUMsV0FBVyxJ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