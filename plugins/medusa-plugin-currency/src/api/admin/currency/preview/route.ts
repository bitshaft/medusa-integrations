import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../lib/currency/api/utils"
import type { AdminFillPreviewType } from "../../../../lib/currency/api/validators"
import { buildPreview } from "../../../../lib/currency/fill"

/**
 * `POST /admin/currency/preview` — what "Fill prices" would do, price by
 * price. Nothing is written. Its `plan.fingerprint` is what `apply` checks.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await resolveEnabled(req)
  res.json(await buildPreview(req.scope, req.validatedBody as AdminFillPreviewType))
}
