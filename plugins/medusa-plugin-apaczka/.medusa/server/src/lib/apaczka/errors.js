"use strict";
/**
 * Error hierarchy for the Apaczka API client.
 *
 * Every error thrown by the client extends `ApaczkaError`, so callers can
 * catch the whole family with one `instanceof` check and still branch on the
 * specific subclass when they need to (e.g. retry network errors, surface API
 * errors to the user).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApaczkaWebhookError = exports.ApaczkaResponseError = exports.ApaczkaTimeoutError = exports.ApaczkaNetworkError = exports.ApaczkaApiError = exports.ApaczkaError = void 0;
class ApaczkaError extends Error {
    /** The API route that was called, e.g. `order_send/`. */
    route;
    constructor(message, options = {}) {
        super(message, { cause: options.cause });
        this.name = new.target.name;
        this.route = options.route;
    }
}
exports.ApaczkaError = ApaczkaError;
/**
 * The API answered, but the envelope `status` was not 200.
 *
 * Apaczka always replies with HTTP 200; the real outcome is in the body.
 */
class ApaczkaApiError extends ApaczkaError {
    /** Application-level status code from the response envelope. */
    status;
    constructor(status, message, route) {
        super(message || `Apaczka API error (status ${status})`, { route });
        this.status = status;
    }
    /** True when the error is caused by wrong credentials or signature. */
    get isAuthenticationError() {
        return this.status === 401 || /signature|app_id|unauthori[sz]ed/i.test(this.message);
    }
}
exports.ApaczkaApiError = ApaczkaApiError;
/** The request never produced a usable HTTP response (DNS, TLS, reset…). */
class ApaczkaNetworkError extends ApaczkaError {
}
exports.ApaczkaNetworkError = ApaczkaNetworkError;
/** The request did not finish within the configured timeout. */
class ApaczkaTimeoutError extends ApaczkaNetworkError {
    timeoutMs;
    constructor(route, timeoutMs) {
        super(`Apaczka request to ${route} timed out after ${timeoutMs} ms`, { route });
        this.timeoutMs = timeoutMs;
    }
}
exports.ApaczkaTimeoutError = ApaczkaTimeoutError;
/** The response body was not the JSON envelope the API documents. */
class ApaczkaResponseError extends ApaczkaError {
    httpStatus;
    body;
    constructor(route, httpStatus, body, cause) {
        super(`Unexpected response from Apaczka for ${route} (HTTP ${httpStatus})`, { route, cause });
        this.httpStatus = httpStatus;
        this.body = body.slice(0, 2000);
    }
}
exports.ApaczkaResponseError = ApaczkaResponseError;
/** A push-tracking webhook failed signature verification or parsing. */
class ApaczkaWebhookError extends ApaczkaError {
}
exports.ApaczkaWebhookError = ApaczkaWebhookError;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3JzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL2xpYi9hcGFjemthL2Vycm9ycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7O0FBRUgsTUFBYSxZQUFhLFNBQVEsS0FBSztJQUNyQyx5REFBeUQ7SUFDaEQsS0FBSyxDQUFTO0lBRXZCLFlBQVksT0FBZSxFQUFFLFVBQStDLEVBQUU7UUFDNUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQTtRQUN4QyxJQUFJLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFBO1FBQzNCLElBQUksQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQTtJQUM1QixDQUFDO0NBQ0Y7QUFURCxvQ0FTQztBQUVEOzs7O0dBSUc7QUFDSCxNQUFhLGVBQWdCLFNBQVEsWUFBWTtJQUMvQyxnRUFBZ0U7SUFDdkQsTUFBTSxDQUFRO0lBRXZCLFlBQVksTUFBYyxFQUFFLE9BQWUsRUFBRSxLQUFhO1FBQ3hELEtBQUssQ0FBQyxPQUFPLElBQUksNkJBQTZCLE1BQU0sR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQTtRQUNuRSxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQTtJQUN0QixDQUFDO0lBRUQsdUVBQXVFO0lBQ3ZFLElBQUkscUJBQXFCO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLE1BQU0sS0FBSyxHQUFHLElBQUksbUNBQW1DLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtJQUN0RixDQUFDO0NBQ0Y7QUFiRCwwQ0FhQztBQUVELDRFQUE0RTtBQUM1RSxNQUFhLG1CQUFvQixTQUFRLFlBQVk7Q0FBRztBQUF4RCxrREFBd0Q7QUFFeEQsZ0VBQWdFO0FBQ2hFLE1BQWEsbUJBQW9CLFNBQVEsbUJBQW1CO0lBQ2pELFNBQVMsQ0FBUTtJQUUxQixZQUFZLEtBQWEsRUFBRSxTQUFpQjtRQUMxQyxLQUFLLENBQUMsc0JBQXNCLEtBQUssb0JBQW9CLFNBQVMsS0FBSyxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQTtRQUMvRSxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQTtJQUM1QixDQUFDO0NBQ0Y7QUFQRCxrREFPQztBQUVELHFFQUFxRTtBQUNyRSxNQUFhLG9CQUFxQixTQUFRLFlBQVk7SUFDM0MsVUFBVSxDQUFRO0lBQ2xCLElBQUksQ0FBUTtJQUVyQixZQUFZLEtBQWEsRUFBRSxVQUFrQixFQUFFLElBQVksRUFBRSxLQUFlO1FBQzFFLEtBQUssQ0FBQyx3Q0FBd0MsS0FBSyxVQUFVLFVBQVUsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUE7UUFDN0YsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUE7UUFDNUIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQTtJQUNqQyxDQUFDO0NBQ0Y7QUFURCxvREFTQztBQUVELHdFQUF3RTtBQUN4RSxNQUFhLG1CQUFvQixTQUFRLFlBQVk7Q0FBRztBQUF4RCxrREFBd0QifQ==