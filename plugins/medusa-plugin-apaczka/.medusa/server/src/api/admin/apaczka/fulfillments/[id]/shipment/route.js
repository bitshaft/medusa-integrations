"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const create_apaczka_shipment_1 = require("../../../../../../workflows/create-apaczka-shipment");
/**
 * `POST /admin/apaczka/fulfillments/:id/shipment` — create the Apaczka order
 * for an existing fulfillment, optionally with adjusted parcels, pickup,
 * COD, insurance, point or additional services.
 */
async function POST(req, res) {
    const { result } = await (0, create_apaczka_shipment_1.createApaczkaShipmentWorkflow)(req.scope).run({
        input: { fulfillment_id: req.params.id, overrides: req.validatedBody.overrides },
    });
    res.status(201).json({ shipment: result });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2FwYWN6a2EvZnVsZmlsbG1lbnRzL1tpZF0vc2hpcG1lbnQvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFVQSxvQkFLQztBQWJELGlHQUFtRztBQUduRzs7OztHQUlHO0FBQ0ksS0FBSyxVQUFVLElBQUksQ0FBQyxHQUF1QyxFQUFFLEdBQW1CO0lBQ3JGLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUEsdURBQTZCLEVBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQztRQUNwRSxLQUFLLEVBQUUsRUFBRSxjQUFjLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFO0tBQ2pGLENBQUMsQ0FBQTtJQUNGLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUE7QUFDNUMsQ0FBQyJ9