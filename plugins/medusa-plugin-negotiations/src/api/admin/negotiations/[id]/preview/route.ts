import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminRoute, parse } from "../../../../../lib/negotiations/api/utils"
import { AdminPreview } from "../../../../../lib/negotiations/api/validators"
import { previewOffer, teamThread } from "../../../../../lib/negotiations/server/threads"

/**
 * `POST /admin/negotiations/:id/preview`: the offer a price would produce,
 * before it is sent: unit prices in whole grosze, the exact total, and
 * warnings for prices under the minimum. Saves nothing.
 */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const { price } = parse(AdminPreview, req.body)
  res.json(await previewOffer(req.scope, await teamThread(req.scope, req.params.id), price))
})
