import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { customerId, requireStoreModule, storeRoute } from "../../../../../lib/compliance/api/utils"
import type { StoreConsentLink } from "../../../../../lib/compliance/api/validators"
import { linkAnonymousConsents } from "../../../../../lib/compliance/server/consents"

/** `POST /store/compliance/consents/link` with `{ anonymous_id }` after sign-in: the browser's cookie choices join the account. */
export const POST = storeRoute(async (req: MedusaRequest<StoreConsentLink>, res: MedusaResponse) => {
  await requireStoreModule(req, "gdpr")
  const created = await linkAnonymousConsents(req.scope, customerId(req), req.validatedBody.anonymous_id)
  res.json({ linked: created.length })
})
