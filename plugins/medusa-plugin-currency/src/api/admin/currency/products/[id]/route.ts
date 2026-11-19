import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../../lib/currency/api/utils"
import { productPrices } from "../../../../../lib/currency/product"

/** `GET /admin/currency/products/:id` — the product's prices with their origin, and what is missing per currency. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await resolveEnabled(req)
  res.json(await productPrices(req.scope, req.params.id))
}
