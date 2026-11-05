"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceStructure = exports.APP_SECRET = exports.APP_ID = void 0;
exports.options = options;
exports.hmac = hmac;
exports.mockFetch = mockFetch;
exports.ok = ok;
exports.apiError = apiError;
exports.formOf = formOf;
const node_crypto_1 = require("node:crypto");
const options_1 = require("../options");
exports.APP_ID = "test-app-id";
exports.APP_SECRET = "test-app-secret";
function options(overrides = {}) {
    return (0, options_1.resolveOptions)({ appId: exports.APP_ID, appSecret: exports.APP_SECRET, ...overrides });
}
function hmac(data, secret = exports.APP_SECRET) {
    return (0, node_crypto_1.createHmac)("sha256", secret).update(data).digest("hex");
}
/** A fetch mock that answers each call with the next queued response. */
function mockFetch(...responses) {
    const calls = [];
    const queue = [...responses];
    const fn = jest.fn(async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        const next = queue.shift();
        if (!next) {
            throw new Error("Unexpected fetch call");
        }
        if (next instanceof Error) {
            throw next;
        }
        const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
        return new Response(text, { status: next.status ?? 200 });
    });
    return { fetch: fn, calls };
}
function ok(response) {
    return { body: { status: 200, message: "", response } };
}
function apiError(status, message) {
    return { body: { status, message, response: null } };
}
function formOf(init) {
    return Object.fromEntries(new URLSearchParams(String(init.body)));
}
exports.serviceStructure = {
    services: {
        "0": {
            service_id: "21",
            name: "Kurier",
            supplier: "DPD",
            domestic: "1",
            pickup_courier: "1",
            door_to_door: "1",
            door_to_point: "0",
            point_to_point: "0",
            point_to_door: "0",
        },
        "1": {
            service_id: "41",
            name: "Paczkomat",
            supplier: "INPOST",
            domestic: "1",
            pickup_courier: "0",
            door_to_door: "0",
            door_to_point: "0",
            point_to_point: "1",
            point_to_door: "0",
        },
        "2": {
            service_id: "22",
            name: "Europe",
            supplier: "DPD",
            domestic: "0",
            pickup_courier: "2",
            door_to_door: "1",
        },
    },
    options: { "31": { type: "bool", name: "Insurance+", desc: "" } },
    package_type: { PACZKA: { type: "PACZKA", desc: "Paczka" } },
    points_type: ["INPOST", "DPD", "POCZTA"],
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZml4dHVyZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvbGliL19fdGVzdHNfXy9maXh0dXJlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFRQSwwQkFFQztBQUVELG9CQUVDO0FBR0QsOEJBZ0JDO0FBRUQsZ0JBRUM7QUFFRCw0QkFFQztBQUVELHdCQUVDO0FBN0NELDZDQUF3QztBQUd4Qyx3Q0FBMkU7QUFFOUQsUUFBQSxNQUFNLEdBQUcsYUFBYSxDQUFBO0FBQ3RCLFFBQUEsVUFBVSxHQUFHLGlCQUFpQixDQUFBO0FBRTNDLFNBQWdCLE9BQU8sQ0FBQyxZQUFnRCxFQUFFO0lBQ3hFLE9BQU8sSUFBQSx3QkFBYyxFQUFDLEVBQUUsS0FBSyxFQUFFLGNBQU0sRUFBRSxTQUFTLEVBQUUsa0JBQVUsRUFBRSxHQUFHLFNBQVMsRUFBRSxDQUFDLENBQUE7QUFDL0UsQ0FBQztBQUVELFNBQWdCLElBQUksQ0FBQyxJQUFZLEVBQUUsTUFBTSxHQUFHLGtCQUFVO0lBQ3BELE9BQU8sSUFBQSx3QkFBVSxFQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBO0FBQ2hFLENBQUM7QUFFRCx5RUFBeUU7QUFDekUsU0FBZ0IsU0FBUyxDQUFDLEdBQUcsU0FBNEQ7SUFDdkYsTUFBTSxLQUFLLEdBQThDLEVBQUUsQ0FBQTtJQUMzRCxNQUFNLEtBQUssR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUE7SUFDNUIsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsR0FBMkIsRUFBRSxJQUFrQixFQUFFLEVBQUU7UUFDM0UsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFB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