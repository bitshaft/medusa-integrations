import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveOlx } from "../../../../lib/olx/runtime"
import type { StoreDefaults } from "../../../../lib/olx/types"

/** `GET /admin/olx/settings` — the defaults every new advert starts from. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  await service.getOptions()
  res.json({ settings: await service.getDefaults() })
}

/** `POST /admin/olx/settings` — saves them. Adverts already on OLX do not change. */
export async function POST(req: MedusaRequest<StoreDefaults>, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  await service.getOptions()
  res.json({ settings: await service.saveDefaults(req.validatedBody) })
}
