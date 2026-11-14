import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { storeOmnibusFor } from "../../../../../../lib/compliance/api/omnibus-store"
import { requireStoreModule, storeRoute } from "../../../../../../lib/compliance/api/utils"
import { ComplianceError } from "../../../../../../lib/compliance/messages"
import { graph } from "../../../../../../lib/compliance/server/runtime"

/** `GET /store/compliance/omnibus/products/:id?region_id=`: the same data for every variant of a product. */
export const GET = storeRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireStoreModule(req, "omnibus")
  const { data } = await graph(req.scope)({
    entity: "product",
    fields: ["id", "variants.id"],
    filters: { id: req.params.id, status: "published" },
  })
  if (!data[0]) throw new ComplianceError("product_not_found")
  const ids = (data[0].variants ?? []).filter(Boolean).map((v: { id: string }) => v.id)
  res.json({ product_id: req.params.id, variants: await storeOmnibusFor(req, ids) })
})
