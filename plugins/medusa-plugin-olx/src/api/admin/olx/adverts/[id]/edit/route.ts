import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { writeView } from "../../../../../../lib/olx/api/utils"
import { updateAdvert } from "../../../../../../lib/olx/engine"
import { buildEngine } from "../../../../../../lib/olx/runtime"
import type { AdvertInput } from "../../../../../../lib/olx/types"

/** `POST /admin/olx/adverts/:id/edit` — saves an edit on OLX. */
export async function POST(req: MedusaRequest<AdvertInput>, res: MedusaResponse) {
  const engine = await buildEngine(req.scope)
  res.json(writeView(await updateAdvert(engine, req.params.id, req.validatedBody)))
}
