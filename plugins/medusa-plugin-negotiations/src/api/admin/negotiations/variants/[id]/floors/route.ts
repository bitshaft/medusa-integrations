import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminRoute, parse } from "../../../../../../lib/negotiations/api/utils"
import { AdminFloors } from "../../../../../../lib/negotiations/api/validators"
import { resolveNegotiations } from "../../../../../../lib/negotiations/server/runtime"
import { requireEnabled } from "../../../../../../lib/negotiations/server/threads"

/** `GET /admin/negotiations/variants/:id/floors`: the variant's minimum prices, one per currency. Never in the Store API. */
export const GET = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  await requireEnabled(req.scope)
  res.json({ floors: await resolveNegotiations(req.scope).getFloors([req.params.id], null) })
})

/** `POST /admin/negotiations/variants/:id/floors` with every minimum price of the variant (an empty list clears them). */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const service = await requireEnabled(req.scope)
  const { floors } = parse(AdminFloors, req.body)
  await service.setFloors(req.params.id, floors)
  res.json({ floors: await service.getFloors([req.params.id], null) })
})
