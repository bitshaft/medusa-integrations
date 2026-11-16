import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { isDemo, requireModule } from "../../../../../../lib/compliance/api/utils"
import type { AdminProductSafety } from "../../../../../../lib/compliance/api/validators"
import { demoGpsrProducts } from "../../../../../../lib/compliance/demo"
import { effectiveSafety } from "../../../../../../lib/compliance/gpsr"
import { productSafety, saveProductSafety, storefrontSafety } from "../../../../../../lib/compliance/server/gpsr"

/** `GET /admin/compliance/gpsr/products/:id`: stored data, profile, what the store shows and the gaps. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireModule(req, "gpsr")
  const base = (await service.getOptions()).defaultLocale
  if (await isDemo(req)) {
    const sample = demoGpsrProducts().find((p) => p.product_id === req.params.id) ?? demoGpsrProducts()[1]
    const effective = effectiveSafety(null, null)
    res.json({
      demo: true,
      data: null,
      profile: null,
      effective,
      gaps: sample.gaps,
      checked_at: sample.checked_at,
      storefront: storefrontSafety(effective, base, base),
    })
    return
  }
  const result = await productSafety(req.scope, req.params.id)
  res.json({ demo: false, ...result, storefront: storefrontSafety(result.effective, base, base) })
}

/** `POST /admin/compliance/gpsr/products/:id`: saves the product's GPSR data and checks it. */
export async function POST(req: MedusaRequest<AdminProductSafety>, res: MedusaResponse) {
  const service = await requireModule(req, "gpsr")
  const base = (await service.getOptions()).defaultLocale
  await saveProductSafety(req.scope, req.params.id, req.validatedBody)
  const result = await productSafety(req.scope, req.params.id)
  res.json({ demo: false, ...result, storefront: storefrontSafety(result.effective, base, base) })
}
