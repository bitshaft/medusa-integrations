import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireStoreModule, storeRoute } from "../../../../../lib/compliance/api/utils"
import type { StoreVerify } from "../../../../../lib/compliance/api/validators"
import { verifyRequest } from "../../../../../lib/compliance/server/requests"

/** `POST /store/compliance/requests/verify` with `{ token }` from the e-mail link: the request reaches the team. */
export const POST = storeRoute(async (req: MedusaRequest<StoreVerify>, res: MedusaResponse) => {
  await requireStoreModule(req, "gdpr")
  const result = await verifyRequest(req.scope, req.validatedBody.token)
  res.json({
    request: { id: result.id, type: result.type, status: result.status, deadline_at: result.deadline_at.toISOString() },
  })
})
