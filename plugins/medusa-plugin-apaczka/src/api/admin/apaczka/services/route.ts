import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { toArray } from "../../../../lib/apaczka/client"
import { buildFulfillmentOptions } from "../../../../lib/apaczka/fulfillment-options"
import { resolveApaczka } from "../../../../lib/apaczka/api/utils"

/**
 * `GET /admin/apaczka/services` — the account's services (as shipping
 * option candidates), additional-service options and package types.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const apaczka = resolveApaczka(req)
  const structure = await (await apaczka.getCatalog()).getServiceStructure({ refresh: req.query.refresh === "true" })

  res.json({
    services: buildFulfillmentOptions(structure, {
      ...(await apaczka.getOptions()),
      offerCodVariants: false,
      offerReturnVariants: false,
    }),
    options: Object.entries(structure.options ?? {}).map(([id, option]) => ({ id, ...option })),
    package_types: Object.entries(structure.package_type ?? {}).map(([id, type]) => ({ id, ...type })),
    points_types: toArray(structure.points_type as Record<string, string> | string[] | undefined),
  })
}
