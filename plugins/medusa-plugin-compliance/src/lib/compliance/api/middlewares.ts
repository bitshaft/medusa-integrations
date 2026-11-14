import { authenticate, type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http"

import { validateQuery } from "../kit/api"
import { refuseAnonymizedCustomers } from "../server/session-guard"
import { refuseInDemo, validateStoreBody, validateStoreQuery } from "./utils"
import {
  AdminConsentType,
  AdminEntriesQuery,
  AdminExportQuery,
  AdminGpsrQuery,
  AdminManufacturer,
  AdminProductSafety,
  AdminRequestAction,
  AdminRequestsQuery,
  StoreConsentLink,
  StoreConsents,
  StoreConsentStateQuery,
  StoreConsentTypesQuery,
  StoreLocaleQuery,
  StoreOmnibusQuery,
  StoreRequest,
  StoreVerify,
} from "./validators"

const customer = authenticate("customer", ["session", "bearer"])
const optionalCustomer = authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })

/**
 * Middleware routes of the compliance plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file.
 */
export const complianceMiddlewares: MiddlewareRoute[] = [
  // Sessions and tokens of anonymised customers stop working at once.
  { matcher: "/store/*", middlewares: [refuseAnonymizedCustomers] },
  { matcher: "/auth/token/refresh", middlewares: [refuseAnonymizedCustomers] },
  { matcher: "/auth/session", middlewares: [refuseAnonymizedCustomers] },

  // Demo mode: no change to real data from the admin page.
  { matcher: "/admin/compliance/manufacturers*", method: ["POST", "DELETE"], middlewares: [refuseInDemo] },
  { matcher: "/admin/compliance/gpsr*", method: ["POST", "DELETE"], middlewares: [refuseInDemo] },
  { matcher: "/admin/compliance/consents*", method: ["POST", "DELETE"], middlewares: [refuseInDemo] },
  { matcher: "/admin/compliance/requests*", method: ["POST", "DELETE"], middlewares: [refuseInDemo] },
  { matcher: "/admin/compliance/omnibus*", method: ["POST", "DELETE"], middlewares: [refuseInDemo] },

  {
    matcher: "/admin/compliance/manufacturers",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminManufacturer)],
  },
  {
    matcher: "/admin/compliance/manufacturers/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminManufacturer)],
  },
  { matcher: "/admin/compliance/gpsr/products", method: ["GET"], middlewares: [validateQuery(AdminGpsrQuery)] },
  {
    matcher: "/admin/compliance/gpsr/products/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminProductSafety)],
  },
  {
    matcher: "/admin/compliance/consents/types",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminConsentType)],
  },
  { matcher: "/admin/compliance/consents/entries", method: ["GET"], middlewares: [validateQuery(AdminEntriesQuery)] },
  { matcher: "/admin/compliance/requests", method: ["GET"], middlewares: [validateQuery(AdminRequestsQuery)] },
  {
    matcher: "/admin/compliance/requests/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminRequestAction)],
  },
  { matcher: "/admin/compliance/requests/:id/export", method: ["GET"], middlewares: [validateQuery(AdminExportQuery)] },
  {
    matcher: "/admin/compliance/customers/:id/export",
    method: ["GET"],
    middlewares: [validateQuery(AdminExportQuery)],
  },

  {
    matcher: "/store/compliance/gpsr/products/:id",
    method: ["GET"],
    middlewares: [validateStoreQuery(StoreLocaleQuery)],
  },
  {
    matcher: "/store/compliance/omnibus/variants/:id",
    method: ["GET"],
    middlewares: [validateStoreQuery(StoreOmnibusQuery)],
  },
  {
    matcher: "/store/compliance/omnibus/products/:id",
    method: ["GET"],
    middlewares: [validateStoreQuery(StoreOmnibusQuery)],
  },
  {
    matcher: "/store/compliance/consents/types",
    method: ["GET"],
    middlewares: [validateStoreQuery(StoreConsentTypesQuery)],
  },
  {
    matcher: "/store/compliance/consents",
    method: ["GET"],
    middlewares: [optionalCustomer, validateStoreQuery(StoreConsentStateQuery)],
  },
  {
    matcher: "/store/compliance/consents",
    method: ["POST"],
    middlewares: [optionalCustomer, validateStoreBody(StoreConsents)],
  },
  {
    matcher: "/store/compliance/consents/link",
    method: ["POST"],
    middlewares: [customer, validateStoreBody(StoreConsentLink)],
  },
  {
    matcher: "/store/compliance/requests",
    method: ["POST"],
    middlewares: [optionalCustomer, validateStoreBody(StoreRequest)],
  },
  { matcher: "/store/compliance/requests/verify", method: ["POST"], middlewares: [validateStoreBody(StoreVerify)] },
]
