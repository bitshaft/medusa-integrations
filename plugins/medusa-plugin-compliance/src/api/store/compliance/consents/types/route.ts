import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requestLanguage, requireStoreModule, storeRoute } from "../../../../../lib/compliance/api/utils"
import type { StoreConsentTypesQuery } from "../../../../../lib/compliance/api/validators"
import { consentCatalog } from "../../../../../lib/compliance/server/consents"
import { resolveCompliance } from "../../../../../lib/compliance/server/runtime"

/** The customer's language, else the store's default, else any language that has text. */
const inLanguage = (values: Partial<Record<string, string>>, language: string | null, base: string) =>
  (language ? values[language] : undefined) || values[base] || Object.values(values).find(Boolean) || null

/**
 * `GET /store/compliance/consents/types?placement=checkout&locale=fr`:
 * active consent types with their current text and version, in any store
 * language. Send the version back when the customer agrees.
 */
export const GET = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireStoreModule(req, "gdpr")
  const query = req.validatedQuery as unknown as StoreConsentTypesQuery
  const language = requestLanguage(req, query.locale)
  const base = (await resolveCompliance(req.scope).getOptions()).defaultLocale
  const types = await consentCatalog(req.scope, query.placement)
  res.json({
    consent_types: types.map((t) => ({
      key: t.key,
      name: inLanguage(t.name, language, base) ?? t.key,
      text: inLanguage(t.text, language, base) ?? "",
      version: t.version,
      required: t.required,
      placement: t.placement,
      cookie_category: t.cookie_category,
      updated_at: t.updated_at,
    })),
  })
})
