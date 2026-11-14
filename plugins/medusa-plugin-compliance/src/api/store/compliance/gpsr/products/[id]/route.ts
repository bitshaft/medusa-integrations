import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requestLocale, requireStoreModule, storeRoute } from "../../../../../../lib/compliance/api/utils"
import type { StoreLocaleQuery } from "../../../../../../lib/compliance/api/validators"
import { ComplianceError } from "../../../../../../lib/compliance/messages"
import { productSafety, storefrontSafety } from "../../../../../../lib/compliance/server/gpsr"
import { graph } from "../../../../../../lib/compliance/server/runtime"

/**
 * `GET /store/compliance/gpsr/products/:id?locale=pl`: manufacturer,
 * responsible person, identification and safety warnings, ready for the
 * product page (warnings as safe HTML, Markdown and plain text).
 */
export const GET = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireStoreModule(req, "gpsr")
  const { data } = await graph(req.scope)({
    entity: "product",
    fields: ["id", "status"],
    filters: { id: req.params.id, status: "published" },
  })
  if (!data[0]) throw new ComplianceError("product_not_found")
  const locale = await requestLocale(req, (req.validatedQuery as StoreLocaleQuery).locale)
  const { effective, gaps } = await productSafety(req.scope, req.params.id)
  res.json({ product_id: req.params.id, complete: gaps.length === 0, gpsr: storefrontSafety(effective, locale) })
})
