import { type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http"

import { validateQuery } from "./utils"
import {
  AdminBookPickup,
  AdminCreateShipment,
  AdminPickupHoursQuery,
  AdminShipmentsQuery,
  AdminSyncPoints,
  AdminTurnIn,
  StorePointClustersQuery,
  StorePointQuery,
  StorePointsQuery,
} from "./validators"

/**
 * Middleware routes of the Apaczka plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file.
 */
export const apaczkaMiddlewares: MiddlewareRoute[] = [
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
    matcher: "/store/apaczka/points/clusters",
    method: ["GET"],
    middlewares: [validateQuery(StorePointClustersQuery)],
  },
  {
    matcher: "/store/apaczka/points/:type/:id",
    method: ["GET"],
    middlewares: [validateQuery(StorePointQuery)],
  },
  {
    matcher: "/admin/apaczka/points/sync",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminSyncPoints)],
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
]
