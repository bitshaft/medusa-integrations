"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApaczkaCatalog = void 0;
const apaczka_1 = require("./apaczka");
/**
 * In-memory cache for Apaczka dictionaries.
 *
 * - The service structure changes rarely, so it is refreshed on a TTL
 *   (daily by default). If a refresh fails, the stale copy keeps being used.
 * - Point lists can be large (tens of thousands of lockers), so each
 *   type/country pair is fetched once per TTL and searched locally.
 *
 * Concurrent callers share one in-flight request.
 */
class ApaczkaCatalog {
    client;
    config;
    structure;
    structureInFlight;
    points = new Map();
    pointsInFlight = new Map();
    constructor(client, config) {
        this.client = client;
        this.config = config;
    }
    now() {
        return this.config.now?.() ?? Date.now();
    }
    async getServiceStructure(options = {}) {
        if (!options.refresh && this.structure && this.structure.expiresAt > this.now()) {
            return this.structure.value;
        }
        if (this.structureInFlight) {
            return this.structureInFlight;
        }
        this.structureInFlight = this.client
            .getServiceStructure()
            .then((value) => {
            this.structure = { value, expiresAt: this.now() + this.config.serviceStructureTtlMs };
            return value;
        })
            .catch((error) => {
            if (this.structure) {
                this.config.logger?.warn(`[apaczka] Could not refresh the service structure, using the cached copy: ${error.message}`);
                return this.structure.value;
            }
            throw error;
        })
            .finally(() => {
            this.structureInFlight = undefined;
        });
        return this.structureInFlight;
    }
    async getServices() {
        return (0, apaczka_1.listServices)(await this.getServiceStructure());
    }
    async getService(serviceId) {
        return (await this.getServices()).find((service) => service.service_id === serviceId);
    }
    /** Point types (`points/{type}/`) the account supports. */
    async getPointTypes() {
        const structure = await this.getServiceStructure();
        return (0, apaczka_1.toArray)(structure.points_type).map(String);
    }
    async getPoints(type, countryCode = "PL") {
        const key = `${type.toUpperCase()}:${countryCode.toUpperCase()}`;
        const cached = this.points.get(key);
        if (cached && cached.expiresAt > this.now()) {
            return cached.value;
        }
        const inFlight = this.pointsInFlight.get(key);
        if (inFlight) {
            return inFlight;
        }
        const request = this.client
            .getPoints(type.toUpperCase(), { country_code: countryCode.toUpperCase() })
            .then((value) => {
            this.points.set(key, { value, expiresAt: this.now() + this.config.pointsTtlMs });
            return value;
        })
            .catch((error) => {
            if (cached) {
                this.config.logger?.warn(`[apaczka] Could not refresh ${key} points, using the cached copy: ${error.message}`);
                return cached.value;
            }
            throw error;
        })
            .finally(() => this.pointsInFlight.delete(key));
        this.pointsInFlight.set(key, request);
        return request;
    }
    async findPoint(type, pointId, countryCode = "PL") {
        const id = pointId.trim().toUpperCase();
        const points = await this.getPoints(type, countryCode);
        return points.find((point) => point.foreign_address_id?.toUpperCase() === id || point.name?.toUpperCase() === id);
    }
    async searchPoints(query) {
        const points = await this.getPoints(query.type, query.countryCode);
        const limit = Math.min(Math.max(query.limit ?? 50, 1), 500);
        const terms = normalize(query.query ?? "")
            .split(/\s+/)
            .filter(Boolean);
        const hasOrigin = Number.isFinite(query.latitude) && Number.isFinite(query.longitude);
        const filtered = [];
        for (const point of points) {
            if (query.cod && point.option_cod === false) {
                continue;
            }
            if (query.sending && point.option_send === false) {
                continue;
            }
            if (terms.length) {
                const haystack = normalize([point.foreign_address_id, point.name, point.address?.line1, point.address?.city, point.address?.postal_code]
                    .filter(Boolean)
                    .join(" "));
                if (!terms.every((term) => haystack.includes(term))) {
                    continue;
                }
            }
            if (hasOrigin) {
                const lat = Number(point.address?.latitude);
                const lng = Number(point.address?.longitude);
                filtered.push({
                    ...point,
                    distance_km: Number.isFinite(lat) && Number.isFinite(lng)
                        ? haversineKm(query.latitude, query.longitude, lat, lng)
                        : undefined,
                });
            }
            else {
                filtered.push(point);
            }
        }
        if (hasOrigin) {
            filtered.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
        }
        return filtered.slice(0, limit);
    }
    /** Drops all cached data. */
    clear() {
        this.structure = undefined;
        this.points.clear();
    }
}
exports.ApaczkaCatalog = ApaczkaCatalog;
/** Lowercase and strip Polish diacritics so "Łódź" matches "lodz". */
function normalize(value) {
    return value
        .toLowerCase()
        .replace(/ł/g, "l")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}
function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2F0YWxvZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9saWIvY2F0YWxvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx1Q0FRa0I7QUFvQmxCOzs7Ozs7Ozs7R0FTRztBQUNILE1BQWEsY0FBYztJQU9OO0lBQ0E7SUFQWCxTQUFTLENBQXNDO0lBQy9DLGlCQUFpQixDQUFtQztJQUMzQyxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQXNDLENBQUE7SUFDdEQsY0FBYyxHQUFHLElBQUksR0FBRyxFQUFtQyxDQUFBO0lBRTVFLFlBQ21CLE1BQXFCLEVBQ3JCLE1BS2hCO1FBTmdCLFdBQU0sR0FBTixNQUFNLENBQWU7UUFDckIsV0FBTSxHQUFOLE1BQU0sQ0FLdEI7SUFDQSxDQUFDO0lBRUksR0FBRztRQUNULE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQTtJQUMxQyxDQUFDO0lBRUQsS0FBSyxDQUFDLG1CQUFtQixDQUFDLFVBQWlDLEVBQUU7UUFDM0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztZQUNoRixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFBO1FBQzdCLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzNCLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFBO1FBQy9CLENBQUM7UUFFRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLE1BQU07YUFDakMsbUJBQW1CLEVBQUU7YUFDckIsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7WUFDZCxJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLFNB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