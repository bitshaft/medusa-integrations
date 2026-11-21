import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { advertView } from "../../../../../lib/olx/api/utils"
import { loadProductDraft } from "../../../../../lib/olx/catalog"
import { resolveOlx } from "../../../../../lib/olx/runtime"

/** `GET /admin/olx/products/:id` — each variant: its advert, or a form ready to publish. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  await service.getOptions()
  const defaults = await service.getDefaults()
  const product = await loadProductDraft(req.scope, req.params.id, defaults)
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product ${req.params.id} was not found.`)
  }
  const adverts = await service.listForProduct(product.product_id)
  res.json({
    product: {
      ...product,
      variants: product.variants.map((variant) => {
        const advert = adverts.find((row) => row.variant_id === variant.variant_id)
        return {
          ...variant,
          advert: advert ? advertView(advert) : null,
          price_differs: Boolean(advert && variant.store_price && Number(advert.price) !== Number(variant.store_price)),
        }
      }),
    },
  })
}
