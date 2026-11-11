import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../../lib/back-in-stock/api/utils"
import { deleteDemo } from "../../../../../lib/back-in-stock/demo"

/**
 * `POST /admin/back-in-stock/demo/delete` with `{ "confirm": "DELETE" }` —
 * removes every demo subscription with its tokens and history. Real
 * subscriptions are never touched.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await resolveEnabled(req)
  res.json({ deleted: await deleteDemo(req.scope) })
}
