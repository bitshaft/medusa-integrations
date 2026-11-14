import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../lib/coupons/api/utils"
import type { AdminCreateBatch } from "../../../../lib/coupons/api/validators"
import { createBatch } from "../../../../lib/coupons/server/admin"
import type { CouponDraft } from "../../../../lib/coupons/types"

/**
 * `POST /admin/coupons/batches` — `quantity` unique single-use codes with an
 * optional `prefix`, sharing the settings in `draft`. Emits
 * `bitshaft.coupons.batch_created` with `{ batch_id }` when done.
 */
export async function POST(req: MedusaRequest<AdminCreateBatch>, res: MedusaResponse) {
  await requireEnabled(req)
  const { draft, prefix, quantity, name } = req.validatedBody
  const result = await createBatch(req.scope, { draft: draft as CouponDraft, prefix, quantity, name })
  res.status(201).json(result)
}
