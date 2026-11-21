import { type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http"

import { validateQuery } from "../kit/api"
import {
  AdminAdvertsQuery,
  AdminBulkPublish,
  AdminCityQuery,
  AdminCommand,
  AdminPublish,
  AdminSearchQuery,
  AdminSettings,
  AdvertBody,
} from "./validators"

/**
 * Middleware routes of the OLX plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file. Admin routes are
 * authenticated by Medusa. The OAuth callback under `/hooks` is public and
 * protected by its single-use state. No matcher is a path prefix of another
 * route, because a matcher also applies to the paths under it.
 */
export const olxMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/olx/settings", method: ["POST"], middlewares: [validateAndTransformBody(AdminSettings)] },
  { matcher: "/admin/olx/adverts", method: ["GET"], middlewares: [validateQuery(AdminAdvertsQuery)] },
  { matcher: "/admin/olx/publish", method: ["POST"], middlewares: [validateAndTransformBody(AdminPublish)] },
  { matcher: "/admin/olx/publish-bulk", method: ["POST"], middlewares: [validateAndTransformBody(AdminBulkPublish)] },
  { matcher: "/admin/olx/adverts/:id/edit", method: ["POST"], middlewares: [validateAndTransformBody(AdvertBody)] },
  {
    matcher: "/admin/olx/adverts/:id/commands",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminCommand)],
  },
  { matcher: "/admin/olx/categories", method: ["GET"], middlewares: [validateQuery(AdminSearchQuery)] },
  { matcher: "/admin/olx/cities", method: ["GET"], middlewares: [validateQuery(AdminCityQuery)] },
]
