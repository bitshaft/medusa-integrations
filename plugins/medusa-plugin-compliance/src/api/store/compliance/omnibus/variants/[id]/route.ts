import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { storeOmnibusFor } from "../../../../../../lib/compliance/api/omnibus-store"
import { requireStoreModule, storeRoute } from "../../../../../../lib/compliance/api/utils"
import { ComplianceError } from "../../../../../../lib/compliance/messages"
import { graph } from "../../../../../../lib/compliance/server/runtime"

/**
 * `GET /store/compliance/omnibus/variants/:id?region_id=`: current price,
 * regular price, whether it is a discount, the lowest price of the period
 * before the discount, when the discount began and whether the history is
 * complete. `known: false` until the variant's price has been recorded.
 */
export const GET = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireStoreModule(req, "omnibus")
  const { data } = await graph(req.scope)({
    entity: "product_variant",
    fields: ["id", "product.status"],
    filters: { id: req.params.id },
  })
  if (!data[0] || data[0].product?.status !== "published") throw new ComplianceError("variant_not_found")
  const [omnibus] = await storeOmnibusFor(req, [req.params.id])
  res.json({ omnibus })
})
