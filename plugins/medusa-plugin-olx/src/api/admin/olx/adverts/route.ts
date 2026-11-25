import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { advertView } from "../../../../lib/olx/api/utils"
import { ensureDemoAdverts } from "../../../../lib/olx/demo-seed"
import { resolveOlx } from "../../../../lib/olx/runtime"

/** `GET /admin/olx/adverts` — the store's adverts, newest first. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  await service.getOptions()
  await ensureDemoAdverts(req.scope)
  const { limit, offset, q, status } = req.validatedQuery as {
    limit: number
    offset: number
    q?: string
    status?: string[]
  }
  const page = await service.listPage({ limit, offset, q, status })
  res.json({ adverts: page.adverts.map(advertView), count: page.count, limit, offset })
}
