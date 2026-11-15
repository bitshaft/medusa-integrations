import type { MiddlewareRoute } from "@medusajs/framework/http"

import { validateQuery } from "./utils"
import {
  AdminOverviewQuery,
  AdminPaymentsQuery,
  AdminPayoutQuery,
  AdminPayoutsQuery,
  AdminRefreshQuery,
} from "./validators"

/**
 * Middleware routes of the Stripe plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file.
 */
export const stripeMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/stripe/overview", method: ["GET"], middlewares: [validateQuery(AdminOverviewQuery)] },
  { matcher: "/admin/stripe/payments", method: ["GET"], middlewares: [validateQuery(AdminPaymentsQuery)] },
  { matcher: "/admin/stripe/payouts", method: ["GET"], middlewares: [validateQuery(AdminPayoutsQuery)] },
  { matcher: "/admin/stripe/payouts/:id", method: ["GET"], middlewares: [validateQuery(AdminPayoutQuery)] },
  { matcher: "/admin/stripe/disputes", method: ["GET"], middlewares: [validateQuery(AdminRefreshQuery)] },
  { matcher: "/admin/stripe/checks", method: ["GET"], middlewares: [validateQuery(AdminRefreshQuery)] },
  { matcher: "/admin/stripe/orders/:id", method: ["GET"], middlewares: [validateQuery(AdminRefreshQuery)] },
]
