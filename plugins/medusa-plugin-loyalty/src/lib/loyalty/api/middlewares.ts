import {
  authenticate,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"

import { validateQuery } from "../kit/api"
import {
  guardLineItemUpdate,
  refuseReservedItemsMetadata,
  refuseReservedMetadata,
  validateCartGifts,
} from "../server/hooks"
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

/** Runs a cart check before Medusa's own route; a refusal goes to Medusa's error handler. */
function guard(check: (req: MedusaRequest) => Promise<void> | void) {
  return async (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
    try {
      await check(req)
    } catch (error) {
      return next(error)
    }
    next()
  }
}

const body = (req: MedusaRequest) => (req.body ?? {}) as Record<string, any>

/**
 * Guards on Medusa's Store API cart routes. A gift line is marked by its
 * metadata, so customers cannot set, change or remove that metadata, and a
 * cart is checked once more at checkout. They are middlewares rather than
 * workflow hooks: Medusa allows one handler per hook, and other plugins or
 * the app may already use the cart hooks.
 */
export const loyaltyCartGuards: MiddlewareRoute[] = [
  {
    matcher: "/store/carts",
    method: ["POST"],
    middlewares: [guard((req) => refuseReservedItemsMetadata(body(req).items))],
  },
  {
    matcher: "/store/carts/:id/line-items",
    method: ["POST"],
    middlewares: [guard((req) => refuseReservedMetadata(body(req).metadata))],
  },
  {
    matcher: "/store/carts/:id/line-items/:line_id",
    method: ["POST"],
    middlewares: [guard((req) => guardLineItemUpdate(req.scope, req.params.id, req.params.line_id, body(req)))],
  },
  {
    matcher: "/store/carts/:id/complete",
    method: ["POST"],
    middlewares: [guard((req) => validateCartGifts(req.scope, req.params.id))],
  },
]

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

  ...loyaltyCartGuards,
]
