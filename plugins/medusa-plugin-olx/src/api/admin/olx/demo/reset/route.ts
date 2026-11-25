import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { restoreDemoAdverts } from "../../../../../lib/olx/demo-seed"
import { resolveOlx } from "../../../../../lib/olx/runtime"

/** `POST /admin/olx/demo/reset` — puts back the sample adverts. Only in demo mode. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  if (!(await service.getOptions()).demo) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This works only in demo mode.")
  }
  res.json({ restored: await restoreDemoAdverts(req.scope) })
}
