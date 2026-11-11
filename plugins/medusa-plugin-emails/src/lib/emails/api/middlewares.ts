import { type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http"

import { validateQuery } from "../kit/api"
import {
  AdminMessagesQuery,
  AdminPreviewType,
  AdminResetAll,
  AdminResetType,
  AdminTestType,
  AdminUpdateSettings,
  AdminUpdateType,
} from "./validators"

/**
 * Middleware routes of the emails plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file.
 */
export const emailsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/emails/settings",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminUpdateSettings)],
  },
  {
    matcher: "/admin/emails/reset",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminResetAll)],
  },
  {
    matcher: "/admin/emails/types/:type",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminUpdateType)],
  },
  {
    matcher: "/admin/emails/types/:type/reset",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminResetType)],
  },
  {
    matcher: "/admin/emails/types/:type/preview",
    method: ["POST"],
    // Edited text for every field in two languages.
    bodyParser: { sizeLimit: "256kb" },
    middlewares: [validateAndTransformBody(AdminPreviewType)],
  },
  {
    matcher: "/admin/emails/types/:type/test",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminTestType)],
  },
  {
    matcher: "/admin/emails/messages",
    method: ["GET"],
    middlewares: [validateQuery(AdminMessagesQuery)],
  },
]
