import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { actorId, resolveEnabled } from "../../../../lib/currency/api/utils"
import type { AdminFillApplyType } from "../../../../lib/currency/api/validators"
import { applyFill } from "../../../../lib/currency/fill"

/**
 * `POST /admin/currency/apply` — saves exactly what the preview with this
 * `fingerprint` showed. When a base price, a current price or a rate
 * changed since, nothing is saved: HTTP 409 with the new preview.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await resolveEnabled(req)
  const result = await applyFill(req.scope, req.validatedBody as AdminFillApplyType, actorId(req))
  if (result.status === "changed") {
    return res.status(409).json({
      type: "plan_changed",
      message: "Prices or rates changed since the preview. Nothing was saved; check the new preview and save again.",
      preview: result.preview,
    })
  }
  res.json(result)
}
