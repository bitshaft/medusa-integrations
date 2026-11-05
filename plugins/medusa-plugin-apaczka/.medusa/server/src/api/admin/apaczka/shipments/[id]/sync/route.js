"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const poll_tracking_1 = require("../../../../../../workflows/helpers/poll-tracking");
const utils_1 = require("../../../../../utils");
/** `POST /admin/apaczka/shipments/:id/sync` — fetch tracking from Apaczka now. */
async function POST(req, res) {
    const result = await (0, poll_tracking_1.pollShipmentTracking)(req.scope, req.params.id);
    const shipment = await (0, utils_1.resolveApaczka)(req).retrieveApaczkaShipment(req.params.id, { relations: ["events"] });
    res.json({ result, shipment });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2Evc2hpcG1lbnRzL1tpZF0vc3luYy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQU1BLG9CQUlDO0FBUkQscUZBQXdGO0FBQ3hGLGdEQUFxRDtBQUVyRCxrRkFBa0Y7QUFDM0UsS0FBSyxVQUFVLElBQUksQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ2hFLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBQSxvQ0FBb0IsRUFBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDbkUsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHNCQUFjLEVBQUMsR0FBRyxDQUFDLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDNUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFBO0FBQ2hDLENBQUMifQ==