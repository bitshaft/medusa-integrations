import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requestLocale, requireStoreModule, storeRoute } from "../../../../../lib/compliance/api/utils"
import type { StoreConsentTypesQuery } from "../../../../../lib/compliance/api/validators"
import { consentCatalog } from "../../../../../lib/compliance/server/consents"

/**
 * `GET /store/compliance/consents/types?placement=checkout&locale=pl`:
 * active consent types with their current text and version. Send the
 * version back when the customer agrees.
 */
export const GET = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireStoreModule(req, "gdpr")
  const query = req.validatedQuery as unknown as StoreConsentTypesQuery
  const locale = await requestLocale(req, query.locale)
  const types = await consentCatalog(req.scope, query.placement)
  res.json({
    consent_types: types.map((t) => ({
      key: t.key,
      name: t.name[locale] ?? t.name.pl ?? t.name.en ?? t.key,
      text: t.text[locale] ?? t.text.pl ?? t.text.en ?? "",
      version: t.version,
      required: t.required,
      placement: t.placement,
      cookie_category: t.cookie_category,
      updated_at: t.updated_at,
    })),
  })
})
