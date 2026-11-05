"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const points_1 = require("../../../../lib/points");
const utils_1 = require("../../../utils");
/**
 * `GET /store/apaczka/points?type=INPOST&q=warszawa&lat=52.23&lng=21.01`
 *
 * Searches parcel points for the storefront picker. Results come from a
 * server-side cache, so the full point list never reaches the browser and
 * the Apaczka secret stays on the server.
 */
async function GET(req, res) {
    const query = req.validatedQuery;
    const points = await (0, utils_1.resolveApaczka)(req)
        .getCatalog()
        .searchPoints({
        type: query.type,
        countryCode: query.country_code,
        query: query.q,
        latitude: query.lat,
        longitude: query.lng,
        cod: query.cod,
        sending: query.sending,
        limit: query.limit,
    });
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ points: points.map(points_1.toPublicPoint), count: points.length });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL2FwYWN6a2EvcG9pbnRzL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBYUEsa0JBaUJDO0FBNUJELG1EQUFzRDtBQUN0RCwwQ0FBK0M7QUFHL0M7Ozs7OztHQU1HO0FBQ0ksS0FBSyxVQUFVLEdBQUcsQ0FBQyxHQUE2QyxFQUFFLEdBQW1CO0lBQzFGLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxjQUFrQyxDQUFBO0lBQ3BELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBQSxzQkFBYyxFQUFDLEdBQUcsQ0FBQztTQUNyQyxVQUFVLEVBQUU7U0FDWixZQUFZLENBQUM7UUFDWixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7UUFDaEIsV0FBVyxFQUFFLEtBQUssQ0FBQyxZQUFZO1FBQy9CLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNkLFFBQVEsRUFBRSxLQUFLLENBQUMsR0FBRztRQUNuQixTQUFTLEVBQUUsS0FBSyxDQUFDLEdBQUc7UUFDcEIsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1FBQ2QsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPO1FBQ3RCLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztLQUNuQixDQUFDLENBQUE7SUFFSixHQUFHLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO0lBQ3JELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxzQkFBYSxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFBO0FBQ3ZFLENBQUMifQ==