import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  ipHash,
  optionalCustomerId,
  requestLocale,
  requireStoreModule,
  storeRoute,
} from "../../../../lib/compliance/api/utils"
import type { StoreRequest } from "../../../../lib/compliance/api/validators"
import { submitRequest } from "../../../../lib/compliance/server/requests"

/**
 * `POST /store/compliance/requests` with `{ type, email?, details? }`.
 * Signed-in customers need no e-mail. The person confirms with the link
 * sent by e-mail (`compliance.request_verification`); limited per e-mail
 * and per IP.
 */
export const POST = storeRoute(async (req: MedusaRequest<StoreRequest>, res: MedusaResponse) => {
  const service = await requireStoreModule(req, "gdpr")
  const body = req.validatedBody
  const result = await submitRequest(req.scope, {
    type: body.type,
    email: body.email ?? null,
    customer_id: optionalCustomerId(req),
    details: body.details ?? null,
    locale: await requestLocale(req, body.locale),
    ip_hash: await ipHash(req),
  })
  const settings = await service.getSettings()
  res.status(201).json({
    request: { id: result.id, status: result.status, expires_at: result.expires_at.toISOString() },
    notice: settings.gdpr.request_notice,
  })
})
