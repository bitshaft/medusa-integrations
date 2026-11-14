import type { MedusaRequest } from "@medusajs/framework/http"

import { ComplianceError } from "../messages"
import { omnibusFor } from "../server/prices"
import { graph, resolveCompliance } from "../server/runtime"
import { storeOmnibus } from "../server/store-views"
import { requestLocale } from "./utils"
import type { StoreOmnibusQuery } from "./validators"

/** Omnibus data for variants in the request's region (required: prices include that region's tax). */
export async function storeOmnibusFor(req: MedusaRequest, variantIds: string[]) {
  const query = req.validatedQuery as unknown as StoreOmnibusQuery
  if (!query.region_id) throw new ComplianceError("region_required")
  const { data: regions } = await graph(req.scope)({
    entity: "region",
    fields: ["id"],
    filters: { id: query.region_id },
  })
  if (!regions[0]) throw new ComplianceError("region_not_found")
  const locale = await requestLocale(req, query.locale)
  const settings = await resolveCompliance(req.scope).getSettings()
  const rows = await omnibusFor(req.scope, variantIds, { region_id: query.region_id })
  return variantIds.map((id) => {
    const row = rows.find((r) => r.variant_id === id)
    return row
      ? { known: true, ...storeOmnibus(row, locale, settings.omnibus.period_days) }
      : { known: false, variant_id: id, region_id: query.region_id }
  })
}
