import {
  authenticate,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"

import { validateQuery } from "../kit/api"
import { resolveBackInStock } from "../runtime"
import { RateLimiter } from "./utils"
import {
  AdminDeleteDemo,
  AdminEndSubscription,
  AdminNotificationsQuery,
  AdminSeedDemo,
  AdminSimulateRestock,
  AdminSubscriptionsQuery,
  AdminWantedQuery,
  StoreConsentQuery,
  StoreSubscribe,
  StoreToken,
} from "./validators"

const limiter = new RateLimiter()

/** Limits store and hooks requests per visitor (`store.rateLimitPerMinute`). */
export async function rateLimit(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const service = resolveBackInStock(req.scope)
  const perMinute = (await service.isEnabled()) ? (await service.getOptions()).store.rateLimitPerMinute : 10
  if (!limiter.allow(req.ip ?? "unknown", perMinute)) {
    res.setHeader("Retry-After", "60")
    res.status(429).json({ type: "rate_limit", message: "Too many requests. Try again in a minute." })
    return
  }
  next()
}

const optionalCustomer = authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })
const requiredCustomer = authenticate("customer", ["session", "bearer"])

/**
 * Middleware routes of the back-in-stock plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file.
 */
export const backInStockMiddlewares: MiddlewareRoute[] = [
  /* Store ------------------------------------------------------------------ */
  {
    matcher: "/store/back-in-stock/subscriptions",
    method: ["POST"],
    middlewares: [rateLimit, optionalCustomer, validateAndTransformBody(StoreSubscribe)],
  },
  {
    matcher: "/store/back-in-stock/subscriptions",
    method: ["GET"],
    middlewares: [requiredCustomer],
  },
  {
    matcher: "/store/back-in-stock/subscriptions/:id/unsubscribe",
    method: ["POST"],
    middlewares: [requiredCustomer],
  },
  {
    matcher: "/store/back-in-stock/confirm",
    method: ["POST"],
    middlewares: [rateLimit, validateAndTransformBody(StoreToken)],
  },
  {
    matcher: "/store/back-in-stock/unsubscribe",
    method: ["POST"],
    middlewares: [rateLimit, validateAndTransformBody(StoreToken)],
  },
  {
    matcher: "/store/back-in-stock/consent",
    method: ["GET"],
    middlewares: [validateQuery(StoreConsentQuery)],
  },

  /* Links in emails --------------------------------------------------------- */
  {
    // The form on the page posts an empty body; mail clients' one-click
    // unsubscribe posts `List-Unsubscribe=One-Click`. Neither needs parsing.
    matcher: "/hooks/back-in-stock/*",
    method: ["GET", "POST"],
    bodyParser: false,
    middlewares: [rateLimit],
  },

  /* Admin ------------------------------------------------------------------- */
  {
    matcher: "/admin/back-in-stock/subscriptions",
    method: ["GET"],
    middlewares: [validateQuery(AdminSubscriptionsQuery)],
  },
  {
    matcher: "/admin/back-in-stock/subscriptions/:id/end",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminEndSubscription)],
  },
  {
    matcher: "/admin/back-in-stock/notifications",
    method: ["GET"],
    middlewares: [validateQuery(AdminNotificationsQuery)],
  },
  {
    matcher: "/admin/back-in-stock/wanted",
    method: ["GET"],
    middlewares: [validateQuery(AdminWantedQuery)],
  },
  {
    matcher: "/admin/back-in-stock/demo",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminSeedDemo)],
  },
  {
    matcher: "/admin/back-in-stock/demo/delete",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminDeleteDemo)],
  },
  {
    matcher: "/admin/back-in-stock/demo/restock",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminSimulateRestock)],
  },
]
