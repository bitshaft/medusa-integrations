"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const utils_1 = require("../../../utils");
/** `GET /admin/apaczka/pickup-hours?postal_code=00-001&service_id=21` — available courier pickup days. */
async function GET(req, res) {
    const { postal_code, service_id } = req.validatedQuery;
    const result = await (await (0, utils_1.resolveApaczka)(req).getClient()).getPickupHours({ postal_code, service_id });
    res.json(result);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2EvcGlja3VwLWhvdXJzL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBTUEsa0JBSUM7QUFSRCwwQ0FBK0M7QUFHL0MsMEdBQTBHO0FBQ25HLEtBQUssVUFBVSxHQUFHLENBQUMsR0FBa0QsRUFBRSxHQUFtQjtJQUMvRixNQUFNLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxHQUFHLEdBQUcsQ0FBQyxjQUF1QyxDQUFBO0lBQy9FLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLElBQUEsc0JBQWMsRUFBQyxHQUFHLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFBO0lBQ3hHLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUE7QUFDbEIsQ0FBQyJ9