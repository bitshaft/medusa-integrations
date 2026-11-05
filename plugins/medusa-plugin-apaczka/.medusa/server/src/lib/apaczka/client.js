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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL2xpYi9hcGFjemthL2NsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUE4VkEsMEJBS0M7QUFHRCxvQ0FLQztBQTNXRCxxQ0FBd0g7QUFDeEgsdUNBQXVDO0FBMEIxQixRQUFBLGlCQUFpQixHQUF1QztJQUNuRSxVQUFVLEVBQUUsZ0NBQWdDO0lBQzVDLE9BQU8sRUFBRSwwQ0FBMEM7Q0FDcEQsQ0FBQTtBQXlDRDs7Ozs7O0dBTUc7QUFDSCxNQUFhLGFBQWE7SUFDZixPQUFPLENBQVE7SUFDZixXQUFXLENBQStCO0lBRWxDLEtBQUssQ0FBUTtJQUNiLFNBQVMsQ0FBUTtJQUNqQixTQUFTLENBQVE7SUFDakIsVUFBVSxDQUFRO0lBQ2xCLGdCQUFnQixDQUFRO0lBQ3hCLFNBQVMsQ0FBUTtJQUNqQixNQUFNLENBQWdCO0lBQ3RCLFNBQVMsQ0FBYztJQUN2QixHQUFHLENBQWM7SUFFbEMsWUFBWSxPQUE2QjtRQUN2QyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN6QyxNQUFNLElBQUkscUJBQVksQ0FBQywwQ0FBMEMsQ0FBQyxDQUFBO1FBQ3BFLENBQUM7UUFFRCxJQUFJLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUE7UUFDMUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFBO1FBQ2xDLElBQUksQ0FBQyxXQUFXLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLElBQUksWUFBWSxDQUFDLENBQUE7UUFDckYsSUFBSSxDQUFDLE9BQU8sR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxJQUFJLHlCQUFpQixDQUFDLE9BQU8sQ0FBQyxXQUFXLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQTtRQUMxRyxJQUFJLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFBO1FBQzVDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLFVBQVUsSUFBSSxDQUFDLENBQUMsQ0FBQTtRQUN0RCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixJQUFJLEdBQUcsQ0FBQTtRQUN2RCxJQUFJLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLElBQUkscUJBQXFCLENBQUE7UUFDM0QsSUFBSSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFBO1FBQzVCLElBQUksQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDLEtBQUssSUFBSSxVQUFVLENBQUMsS0FBSyxDQUFBO1FBQ2xELElBQUksQ0FBQyxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFBO1FBRWxDLElBQUksT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ3pDLE1BQU0sSUFBSSxxQkFBWSxDQUFDLDZEQUE2RCxDQUFDLENBQUE7UUFDdkYsQ0FBQztJQUNILENBQUM7SUFFRCw0RUFBNEU7SUFDNUUsNkVBQTZFO0lBQzdFLDRFQUE0RTtJQUU1RSxrRkFBa0Y7SUFDbEYsbUJBQW1CLENBQUMsTUFBb0I7UUFDdEMsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQTtJQUMxRSxDQUFDO0lBRUQsZ0VBQWdFO0lBQ2hFLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBWSxFQUFFLFVBQWdDLEVBQUUsRUFBRSxNQUFvQjtRQUNwRixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQzlCLFVBQVUsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFDckMsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsR0FBRyxPQUFPLEVBQUUsRUFDL0MsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUM3QixDQUFBO1FBQ0QsT0FBTyxPQUFPLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFBO0lBQ2xDLENBQUM7SUFFRCw0RUFBNEU7SUFDNUUsNkVBQTZFO0lBQzdFLDRFQUE0RTtJQUU1RTs7O09BR0c7SUFDSCxZQUFZLENBQUMsS0FBd0IsRUFBRSxNQUFvQjtRQUN6RCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQTtJQUMvRSxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUF3QixFQUFFLE1BQW9CO1FBQzVELE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FDOUIsYUFBYSxFQUNiLEVBQUUsS0FBSyxFQUFFLEVBQ1QsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUM5QixDQUFBO1FBQ0QsT0FBTyxRQUFRLENBQUMsS0FBSyxDQUFBO0lBQ3ZCLENBQUM7SUFFRCxLQUFLLENBQUMsUUFBUSxDQUFDLE9BQXdCLEVBQUUsTUFBb0I7UUFDM0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUM5QixTQUFTLE9BQU8sR0FBRyxFQUNuQixFQUFFLEVBQ0YsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUM3QixDQUFBO1FBQ0QsT0FBTyxRQUFRLENBQUMsS0FBSyxDQUFBO0lBQ3ZCLENBQUM7SUFFRCxpRUFBaUU7SUFDakUsS0FBSyxDQUFDLFVBQVUsQ0FBQyxVQUFvQyxFQUFFLEVBQUUsTUFBb0I7UUFDM0UsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUM5QixTQUFTLEVBQ1QsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFDckUsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUM3QixDQUFBO1FBQ0QsT0FBTyxPQUFPLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFBO0lBQ2xDLENBQUM7SUFFRCw0RUFBNEU7SUFDNUUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxPQUF3QixFQUFFLE1BQW9CO1FBQzlELE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsT0FBTyxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFBO0lBQ2hGLENBQUM7SUFFRCw0RUFBNEU7SUFDNUUsNkVBQTZFO0lBQzdFLDRFQUE0RTtJQUU1RSxpRkFBaUY7SUFDakYsVUFBVSxDQUFDLE9BQXdCLEVBQUUsTUFBb0I7UUFDdkQsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsT0FBTyxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFBO0lBQzNFLENBQUM7SUFFRCxxRkFBcUY7SUFDckYsZUFBZSxDQUFDLE9BQXdCLEVBQUUsTUFBb0I7UUFDNUQsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixPQUFPLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUE7SUFDakYsQ0FBQztJQUVELGtGQUFrRjtJQUNsRixTQUFTLENBQUMsUUFBZ0MsRUFBRSxNQUFvQjtRQUM5RCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQTtJQUNqRyxDQUFDO0lBRUQsNEVBQTRFO0lBQzVFLDZFQUE2RTtJQUM3RSw0RUFBNEU7SUFFNUUsbUVBQW1FO0lBQ25FLEtBQUssQ0FBQyxjQUFjLENBQ2xCLE9BQWtDLEVBQ2xDLE1BQW9CO1FBRXBCLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBcUIsZUFBZSxFQUFFLE9BQU8sRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQTtRQUM1RyxPQUFPLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQTtJQUM3RSxDQUFDO0lBRUQsNEZBQTRGO0lBQzVGLFdBQVcsQ0FDVCxPQUF3QixFQUN4QixPQUE2QixFQUM3QixNQUFvQjtRQUVwQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxPQUFPLEdBQUcsRUFBRSxPQUFPLEVBQUUsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUE7SUFDaEYsQ0FBQztJQUVELDhFQUE4RTtJQUM5RSxXQUFXLENBQUMsT0FBa0MsRUFBRSxNQUFvQjtRQUNsRSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQ2QsZUFBZSxFQUNmLEVBQUUsR0FBRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQ3hELEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FDOUIsQ0FBQTtJQUNILENBQUM7SUFFRCw0RUFBNEU7SUFDNUUsNkVBQTZFO0lBQzdFLDRFQUE0RTtJQUU1RSxnRUFBZ0U7SUFDaEUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxhQUFxQixFQUFFLE1BQW9CO1FBQzNELE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FDOUIsWUFBWSxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUNoRCxFQUFFLEVBQ0YsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUM3QixDQUFBO1FBQ0QsT0FBTyxFQUFFLEdBQUcsUUFBUSxFQUFFLElBQUksRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUE7SUFDdkQsQ0FBQztJQUVELDRFQUE0RTtJQUM1RSw2RUFBNkU7SUFDN0UsNEVBQTRFO0lBRTVFOzs7O09BSUc7SUFDSCxLQUFLLENBQUMsSUFBSSxDQUFJLEtBQWEsRUFBRSxPQUFnQixFQUFFLE9BQW9CO1FBQ2pFLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDekIseUVBQXlFO1lBQ3pFLE1BQU0sSUFBSSxxQkFBWSxDQUFDLFVBQVUsS0FBSyxrQ0FBa0MsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUE7UUFDdEYsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDN0QsSUFBSSxTQUFrQixDQUFBO1FBRXRCLEtBQUssSUFBSSxPQUFPLEdBQUcsQ0FBQyxFQUFFLE9BQU8sSUFBSSxRQUFRLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQztZQUNyRCxJQUFJLENBQUM7Z0JBQ0gsT0FBTyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUksS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDM0QsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsU0FBUyxHQUFHLEtBQUssQ0FBQTtnQkFDakIsSUFBSSxPQUFPLElBQUksUUFBUSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7b0JBQzFFLE1BQU0sS0FBSyxDQUFBO2dCQUNiLENBQUM7Z0JBQ0QsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsQ0FBQTtnQkFDckQsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQ2YsYUFBYSxLQUFLLFlBQWEsS0FBZSxDQUFDLE9BQU8sWUFBWSxPQUFPLElBQUksUUFBUSxHQUFHLENBQUMsT0FBTyxLQUFLLEtBQUssQ0FDM0csQ0FBQTtnQkFDRCxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUNwQixDQUFDO1FBQ0gsQ0FBQztRQUVELE1BQU0sU0FBUyxDQUFBO0lBQ2pCLENBQUM7SUFFTyxLQUFLLENBQUMsSUFBSSxDQUFJLEtBQWEsRUFBRSxPQUFnQixFQUFFLE1BQW9CO1FBQ3pFLE1BQU0sUUFBUSxHQUFHLElBQUEscUJBQVcsRUFBQztZQUMzQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO1lBQ3pCLEtBQUs7WUFDTCxPQUFPO1lBQ1AsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1NBQ2QsQ0FBQyxDQUFBO1FBRUYsTUFBTSxVQUFVLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQTtRQUN4QyxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQTtRQUNsRSxNQUFNLE9BQU8sR0FBRyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUE7UUFDeEMsTUFBTSxFQUFFLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQTtRQUUxRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUE7UUFDNUIsSUFBSSxZQUFzQixDQUFBO1FBQzFCLElBQUksQ0FBQztZQUNILFlBQVksR0FBRyxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLEVBQUU7Z0JBQ3hELE1BQU0sRUFBRSxNQUFNO2dCQUNkLE9BQU8sRUFBRTtvQkFDUCxjQUFjLEVBQUUsbUNBQW1DO29CQUNuRCxNQUFNLEVBQUUsa0JBQWtCO29CQUMxQixZQUFZLEVBQUUsSUFBSSxDQUFDLFNBQVM7aUJBQzdCO2dCQUNELElBQUksRUFBRSxJQUFJLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLEVBQUU7Z0JBQzlDLE1BQU0sRUFBRSxVQUFVLENBQUMsTUFBTTthQUMxQixDQUFDLENBQUE7UUFDSixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLElBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQyxPQUFPLElBQUksQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7Z0JBQ2xELE1BQU0sSUFBSSw0QkFBbUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFBO1lBQ3RELENBQUM7WUFDRCxNQUFNLElBQUksNEJBQW1CLENBQUMsc0JBQXNCLEtBQUssWUFBYSxLQUFlLENBQUMsT0FBTyxFQUFFLEVBQUU7Z0JBQy9GLEtBQUs7Z0JBQ0wsS0FBSyxFQUFFLEtBQUs7YUFDYixDQUFDLENBQUE7UUFDSixDQUFDO2dCQUFTLENBQUM7WUFDVCxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDbkIsTUFBTSxFQUFFLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQTtRQUMvQyxDQUFDO1FBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUE7UUFDdEMsSUFBSSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQyxrQkFBa0IsS0FBSyxZQUFZLFlBQVksQ0FBQyxNQUFNLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFNBQVMsS0FBSyxDQUFDLENBQUE7UUFFOUcsSUFBSSxJQUF3QixDQUFBO1FBQzVCLElBQUksQ0FBQztZQUNILElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ3pCLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLDZCQUFvQixDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUN6RSxDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLElBQUksT0FBTyxJQUFJLENBQUMsTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3pFLE1BQU0sSUFBSSw2QkFBb0IsQ0FBQyxLQUFLLEVBQUUsWUFBWSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQTtRQUNsRSxDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ3hCLE1BQU0sSUFBSSx3QkFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUM3RCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsUUFBYSxDQUFBO0lBQzNCLENBQUM7Q0FDRjtBQXpRRCxzQ0F5UUM7QUFFRCw4RUFBOEU7QUFDOUUsK0VBQStFO0FBQy9FLDhFQUE4RTtBQUU5RSxpRkFBaUY7QUFDakYsU0FBZ0IsT0FBTyxDQUFJLEtBQWlEO0lBQzFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNYLE9BQU8sRUFBRSxDQUFBO0lBQ1gsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBO0FBQzVELENBQUM7QUFFRCxnRkFBZ0Y7QUFDaEYsU0FBZ0IsWUFBWSxDQUFDLFNBQWtDO0lBQzdELE9BQU8sT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkQsR0FBRyxPQUFPO1FBQ1YsVUFBVSxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDO0tBQ3ZDLENBQUMsQ0FBQyxDQUFBO0FBQ0wsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsR0FBVztJQUNuQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQTtBQUM1QyxDQUFDO0FBRUQsU0FBUyxXQUFXLENBQUMsS0FBYztJQUNqQyxJQUFJLEtBQUssWUFBWSw0QkFBbUIsRUFBRSxDQUFDO1FBQ3pDLE9BQU8sSUFBSSxDQUFBO0lBQ2IsQ0FBQztJQUNELElBQUksS0FBSyxZQUFZLDZCQUFvQixFQUFFLENBQUM7UUFDMUMsT0FBTyxLQUFLLENBQUMsVUFBVSxJQUFJLEdBQUcsSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLEdBQUcsQ0FBQTtJQUM1RCxDQUFDO0lBQ0QsOEVBQThFO0lBQzlFLE9BQU8sS0FBSyxDQUFBO0FBQ2QsQ0FBQztBQUVELFNBQVMsT0FBTyxDQUFDLE1BQWMsRUFBRSxPQUFlO0lBQzlDLE1BQU0sV0FBVyxHQUFHLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUE7SUFDL0MsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDeEUsQ0FBQztBQUVELFNBQVMsS0FBSyxDQUFDLEVBQVU7SUFDdkIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFBO0FBQzFELENBQUMifQ==