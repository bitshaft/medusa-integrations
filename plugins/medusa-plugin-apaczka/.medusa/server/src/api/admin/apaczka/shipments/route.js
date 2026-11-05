"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const utils_1 = require("../../../utils");
/** `GET /admin/apaczka/shipments?order_id=order_123` — shipments with their tracking history. */
async function GET(req, res) {
    const { order_id, fulfillment_id, status, limit, offset } = req.validatedQuery;
    const filters = {};
    if (order_id)
        filters.order_id = order_id;
    if (fulfillment_id)
        filters.fulfillment_id = fulfillment_id;
    if (status)
        filters.status = status.split(",");
    const [shipments, count] = await (0, utils_1.resolveApaczka)(req).listAndCountApaczkaShipments(filters, {
        relations: ["events"],
        order: { created_at: "DESC" },
        take: limit,
        skip: offset,
    });
    res.json({
        shipments: shipments.map((shipment) => ({
            ...shipment,
            events: [...(shipment.events ?? [])].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()),
        })),
        count,
        limit,
        offset,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2Evc2hpcG1lbnRzL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBTUEsa0JBMEJDO0FBOUJELDBDQUErQztBQUcvQyxpR0FBaUc7QUFDMUYsS0FBSyxVQUFVLEdBQUcsQ0FBQyxHQUFnRCxFQUFFLEdBQW1CO0lBQzdGLE1BQU0sRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDLGNBQXFDLENBQUE7SUFFckcsTUFBTSxPQUFPLEdBQTRCLEVBQUUsQ0FBQTtJQUMzQyxJQUFJLFFBQVE7UUFBRSxPQUFPLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQTtJQUN6QyxJQUFJLGNBQWM7UUFBRSxPQUFPLENBQUMsY0FBYyxHQUFHLGNBQWMsQ0FBQTtJQUMzRCxJQUFJLE1BQU07UUFBRSxPQUFPLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7SUFFOUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLElBQUEsc0JBQWMsRUFBQyxHQUFHLENBQUMsQ0FBQyw0QkFBNEIsQ0FBQyxPQUFPLEVBQUU7UUFDekYsU0FBUyxFQUFFLENBQUMsUUFBUSxDQUFDO1FBQ3JCLEtBQUssRUFBRSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUU7UUFDN0IsSUFBSSxFQUFFLEtBQUs7UUFDWCxJQUFJLEVBQUUsTUFBTTtLQUNiLENBQUMsQ0FBQTtJQUVGLEdBQUcsQ0FBQyxJQUFJLENBQUM7UUFDUCxTQUFTLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN0QyxHQUFHLFFBQVE7WUFDWCxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FDdkMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsT0FBTyxFQUFFLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUNoRjtTQUNGLENBQUMsQ0FBQztRQUNILEtBQUs7UUFDTCxLQUFLO1FBQ0wsTUFBTTtLQUNQLENBQUMsQ0FBQTtBQUNKLENBQUMifQ==