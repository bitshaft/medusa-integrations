import { type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http"

import { validateQuery } from "../kit/api"
import { AdminFillApply, AdminFillPreview, AdminRatesQuery, AdminRunsQuery, AdminSample } from "./validators"

/**
 * Middleware routes of the currency plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file. Admin routes are
 * authenticated by Medusa.
 */
export const currencyMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/currency/rates", method: ["GET"], middlewares: [validateQuery(AdminRatesQuery)] },
  { matcher: "/admin/currency/sample", method: ["POST"], middlewares: [validateAndTransformBody(AdminSample)] },
  { matcher: "/admin/currency/preview", method: ["POST"], middlewares: [validateAndTransformBody(AdminFillPreview)] },
  { matcher: "/admin/currency/apply", method: ["POST"], middlewares: [validateAndTransformBody(AdminFillApply)] },
  { matcher: "/admin/currency/runs", method: ["GET"], middlewares: [validateQuery(AdminRunsQuery)] },
]
