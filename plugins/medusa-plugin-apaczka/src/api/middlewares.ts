import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"

import { validateQuery } from "./utils"
import {
  AdminBookPickup,
  AdminCreateShipment,
  AdminPickupHoursQuery,
  AdminShipmentsQuery,
  AdminTurnIn,
  StorePointQuery,
  StorePointsQuery,
} from "./validators"

export default defineMiddlewares({
  routes: [
    {
      // Signature verification needs the exact bytes Apaczka sent.
      matcher: "/hooks/apaczka/tracking",
      method: ["POST"],
      bodyParser: { preserveRawBody: true, sizeLimit: "256kb" },
    },
    {
      matcher: "/store/apaczka/points",
      method: ["GET"],
      middlewares: [validateQuery(StorePointsQuery)],
    },
    {
      matcher: "/store/apaczka/points/:type/:id",
      method: ["GET"],
      middlewares: [validateQuery(StorePointQuery)],
    },
    {
      matcher: "/admin/apaczka/shipments",
      method: ["GET"],
      middlewares: [validateQuery(AdminShipmentsQuery)],
    },
    {
      matcher: "/admin/apaczka/pickup-hours",
      method: ["GET"],
      middlewares: [validateQuery(AdminPickupHoursQuery)],
    },
    {
      matcher: "/admin/apaczka/fulfillments/:id/shipment",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminCreateShipment)],
    },
    {
      matcher: "/admin/apaczka/fulfillments/:id/valuation",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminCreateShipment)],
    },
    {
      matcher: "/admin/apaczka/pickups",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminBookPickup)],
    },
    {
      matcher: "/admin/apaczka/turn-in",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminTurnIn)],
    },
  ],
})
