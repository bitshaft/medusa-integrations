import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { resolveApaczka } from "../../../../lib/apaczka/api/utils"

type VariantRow = {
  id: string
  title: string | null
  sku: string | null
  product_id: string | null
  product?: { id: string; title: string | null } | null
}

/**
 * `GET /admin/apaczka/variants-without-weight?limit=&offset=` — variants
 * shipped with the default weight because they have none. Products that
 * need no shipping are still listed; the admin links to each product.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // Only when the plugin runs, like every Apaczka admin route.
  await resolveApaczka(req).getOptions()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const products = req.scope.resolve(Modules.PRODUCT) as unknown as {
    listAndCountProductVariants: (
      filters: Record<string, unknown>,
      config: Record<string, unknown>
    ) => Promise<[VariantRow[], number]>
  }
  const [variants, count] = await products.listAndCountProductVariants(
    { weight: null },
    { take: limit, skip: offset, relations: ["product"], order: { created_at: "DESC" } }
  )
  res.json({
    variants: variants.map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      product_id: v.product?.id ?? v.product_id,
      product_title: v.product?.title ?? null,
    })),
    count,
    limit,
    offset,
  })
}
