import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../../lib/back-in-stock/api/utils"
import type { AdminSimulateRestockBody } from "../../../../../lib/back-in-stock/api/validators"
import { simulateRestock } from "../../../../../lib/back-in-stock/demo"

/**
 * `POST /admin/back-in-stock/demo/restock` — runs the notification pipeline
 * for a variant as if it had just come back, for its demo subscriptions
 * only. Inventory is not touched and nothing is sent.
 */
export async function POST(req: MedusaRequest<AdminSimulateRestockBody>, res: MedusaResponse) {
  await resolveEnabled(req)
  res.json({ outcome: await simulateRestock(req.scope, req.validatedBody) })
}
