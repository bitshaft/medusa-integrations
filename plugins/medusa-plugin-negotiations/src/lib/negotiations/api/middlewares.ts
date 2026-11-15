import {
  authenticate,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
  type MiddlewareRoute,
} from "@medusajs/framework/http"

import { NegotiationError, normalizeLocale } from "../messages"
import { loadCart } from "../server/catalog"
import { resolveNegotiations } from "../server/runtime"
import { guardLineItemUpdate, refuseReservedMetadata, validateCartNegotiations } from "../server/writers"

// Signed-out callers reach the routes, which refuse them with a message in both languages.
const customer = authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })

/** Answers a guard's refusal the way the plugin's store routes do. */
function guard(check: (req: MedusaRequest) => Promise<void>) {
  return async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    try {
      if (await resolveNegotiations(req.scope).isEnabled()) await check(req)
    } catch (error) {
      if (!(error instanceof NegotiationError)) return next(error)
      const locale = normalizeLocale(req.get("x-medusa-locale") ?? req.get("accept-language"))
      res.status(error.httpStatus).json({
        type: error.type,
        code: error.code,
        message: error.localized(locale),
        messages: { pl: error.localized("pl"), en: error.localized("en") },
      })
      return
    }
    next()
  }
}

const body = (req: MedusaRequest) => (req.body ?? {}) as Record<string, any>

/**
 * Middleware routes of the negotiations plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file.
 *
 * The cart guards are middlewares on the Store API routes rather than
 * workflow hooks: Medusa allows one handler per hook, and other plugins
 * (or the app) may already use the cart hooks.
 */
export const negotiationsMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/negotiations*", middlewares: [customer] },

  // Customers cannot tag their own lines as negotiated.
  {
    matcher: "/store/carts/:id/line-items",
    method: ["POST"],
    middlewares: [guard(async (req) => refuseReservedMetadata(body(req).metadata))],
  },
  // A negotiated line keeps the agreed quantity.
  {
    matcher: "/store/carts/:id/line-items/:line_id",
    method: ["POST"],
    middlewares: [guard((req) => guardLineItemUpdate(req.scope, req.params.id, req.params.line_id, body(req)))],
  },
  // Checkout: negotiated lines must still match a valid agreed offer.
  {
    matcher: "/store/carts/:id/complete",
    method: ["POST"],
    middlewares: [
      guard(async (req) => {
        const cart = await loadCart(req.scope, req.params.id)
        if (cart) await validateCartNegotiations(req.scope, cart)
      }),
    ],
  },
]
