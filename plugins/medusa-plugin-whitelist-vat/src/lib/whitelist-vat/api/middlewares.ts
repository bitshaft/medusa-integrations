import {
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { validateQuery } from "../kit/api"
import { verifyCart } from "../records"
import { resolveWhitelistVat } from "./utils"
import {
  AdminCheckBankAccount,
  AdminChecksQuery,
  AdminRecordVerify,
  AdminSubjectsQuery,
  AdminVerify,
  StoreVerify,
} from "./validators"

/**
 * With `checkout.rejectOnCompletion`, refuses to complete a cart whose tax
 * ID has one of `checkout.rejectStatuses`. It is a middleware rather than a
 * handler of the `completeCartWorkflow` validate hook, because a hook takes
 * a single handler and the store may want that one for itself.
 *
 * Carts without a tax ID pass. So does every cart when the registers cannot
 * be asked or anything in the check fails: only a definite verdict rejects.
 */
export async function rejectUnverifiedCart(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  try {
    const service = resolveWhitelistVat(req)
    if (!(await service.isEnabled())) {
      return next()
    }
    const { checkout } = await service.getOptions()
    if (!checkout.rejectOnCompletion) {
      return next()
    }
    const { tax_id: taxId, verification } = await verifyCart(req.scope, req.params.id)
    if (taxId && verification && (checkout.rejectStatuses as string[]).includes(verification.status)) {
      return next(
        new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `The tax ID ${taxId.number} could not be confirmed (${verification.status}). ` +
            "Correct it or remove it from the order to continue."
        )
      )
    }
  } catch (error) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[whitelist-vat] Skipped the checkout check for cart ${req.params.id}: ${(error as Error).message}`)
  }
  next()
}

/**
 * Middleware routes of the whitelist-vat plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file.
 */
export const whitelistVatMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/carts/:id/complete",
    method: ["POST"],
    middlewares: [rejectUnverifiedCart],
  },
  {
    matcher: "/store/whitelist-vat/verify",
    method: ["POST"],
    middlewares: [validateAndTransformBody(StoreVerify)],
  },
  {
    matcher: "/admin/whitelist-vat/verify",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminVerify)],
  },
  {
    matcher: "/admin/whitelist-vat/bank-account",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminCheckBankAccount)],
  },
  {
    matcher: "/admin/whitelist-vat/subjects",
    method: ["GET"],
    middlewares: [validateQuery(AdminSubjectsQuery)],
  },
  {
    matcher: "/admin/whitelist-vat/checks",
    method: ["GET"],
    middlewares: [validateQuery(AdminChecksQuery)],
  },
  {
    matcher: "/admin/whitelist-vat/orders/:id/verify",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminRecordVerify)],
  },
  {
    matcher: "/admin/whitelist-vat/customers/:id/verify",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminRecordVerify)],
  },
]
