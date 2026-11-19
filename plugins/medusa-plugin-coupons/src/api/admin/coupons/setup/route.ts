import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { setupStep } from "../../../../lib/coupons/kit/setup"
import { DEMO_NAME_PREFIX } from "../../../../lib/coupons/server/demo"
import { resolveCoupons } from "../../../../lib/coupons/server/query"

/**
 * `GET /admin/coupons/setup`: the installation steps for the Guide tab, with
 * their status detected from this store. Demo coupons ("[Demo] " names) do
 * not count. Texts live in the admin translations.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveCoupons(req.scope)
  if (!(await service.isEnabled())) {
    return res.json({ steps: [setupStep("install", false)] })
  }
  const options = await service.getOptions()
  const coupons = (
    await service.listCouponsCoupons({}, { select: ["id", "name", "batch_size", "automatic"], take: 1000 })
  ).filter((c) => !c.name?.startsWith(DEMO_NAME_PREFIX))

  res.json({
    steps: [
      setupStep("install", true),
      setupStep("firstCoupon", coupons.length > 0, { params: { count: coupons.length } }),
      setupStep("storefront", null),
      setupStep(
        "automatic",
        coupons.some((c) => c.automatic),
        { optional: true }
      ),
      setupStep(
        "batch",
        coupons.some((c) => Boolean(c.batch_size)),
        { optional: true }
      ),
      setupStep("production", !options.demo),
    ],
  })
}
