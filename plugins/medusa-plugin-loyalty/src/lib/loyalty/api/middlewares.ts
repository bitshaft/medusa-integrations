import { authenticate, type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http"

import { validateQuery } from "../kit/api"
import {
  AdminAdjust,
  AdminCustomersQuery,
  AdminEntriesQuery,
  AdminPreview,
  AdminReward,
  StoreBirthday,
  StoreEstimateQuery,
  StoreHistoryQuery,
  StoreRedeem,
} from "./validators"

const customer = authenticate("customer", ["session", "bearer"])
const optionalCustomer = authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })

/**
 * Middleware routes of the loyalty plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file.
 */
export const loyaltyMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/loyalty/rewards", method: ["POST"], middlewares: [validateAndTransformBody(AdminReward)] },
  { matcher: "/admin/loyalty/rewards/:id", method: ["POST"], middlewares: [validateAndTransformBody(AdminReward)] },
  { matcher: "/admin/loyalty/customers", method: ["GET"], middlewares: [validateQuery(AdminCustomersQuery)] },
  { matcher: "/admin/loyalty/customers/:id/entries", method: ["GET"], middlewares: [validateQuery(AdminEntriesQuery)] },
  {
    matcher: "/admin/loyalty/customers/:id/adjust",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminAdjust)],
  },
  { matcher: "/admin/loyalty/preview", method: ["POST"], middlewares: [validateAndTransformBody(AdminPreview)] },

  { matcher: "/store/loyalty/me", method: ["GET"], middlewares: [customer] },
  { matcher: "/store/loyalty/history", method: ["GET"], middlewares: [customer, validateQuery(StoreHistoryQuery)] },
  { matcher: "/store/loyalty/rewards", method: ["GET"], middlewares: [optionalCustomer] },
  {
    matcher: "/store/loyalty/rewards/:id/redeem",
    method: ["POST"],
    middlewares: [customer, validateAndTransformBody(StoreRedeem)],
  },
  {
    matcher: "/store/loyalty/estimate",
    method: ["GET"],
    middlewares: [optionalCustomer, validateQuery(StoreEstimateQuery)],
  },
  {
    matcher: "/store/loyalty/birthday",
    method: ["POST"],
    middlewares: [customer, validateAndTransformBody(StoreBirthday)],
  },
]
