import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { requireEnabled } from "../../../../../lib/coupons/api/utils"
import { demoEnabled, resetCouponsDemo } from "../../../../../lib/coupons/server/demo"

/**
 * `POST /admin/coupons/demo/reset` — "Restore test data", demo mode only:
 * deletes the "[Demo]" coupons and creates the demo set again.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  if (!(await demoEnabled(req.scope))) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Test data can only be restored in demo mode: set demo: true in the plugin options and restart Medusa."
    )
  }
  res.json(await resetCouponsDemo(req.scope))
}
