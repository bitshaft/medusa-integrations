import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireModule } from "../../../../../lib/compliance/api/utils"
import { recomputeGpsr } from "../../../../../lib/compliance/server/gpsr"

/** `POST /admin/compliance/gpsr/recompute`: checks every product now instead of waiting for the daily job. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await requireModule(req, "gpsr")
  res.json(await recomputeGpsr(req.scope))
}
