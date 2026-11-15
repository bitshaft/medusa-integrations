import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminRoute, parse } from "../../../../lib/negotiations/api/utils"
import { AdminSettings } from "../../../../lib/negotiations/api/validators"
import { PACKAGE_NAME } from "../../../../lib/negotiations/options"
import { resolveNegotiations } from "../../../../lib/negotiations/server/runtime"
import { requireEnabled } from "../../../../lib/negotiations/server/threads"

async function view(req: MedusaRequest) {
  const service = resolveNegotiations(req.scope)
  const enabled = await service.isEnabled()
  return {
    enabled,
    disabled_reason: await service.disabledReason(),
    package: PACKAGE_NAME,
    /** Options from medusa-config, read-only here. */
    options: await service.getOptions(),
    settings: await service.getSettings(),
  }
}

/** `GET /admin/negotiations/settings` */
export const GET = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  res.json(await view(req))
})

/** `POST /admin/negotiations/settings` with the whole settings object (counter modes, maximum discount, armed writers). */
export const POST = adminRoute(async (req: MedusaRequest, res: MedusaResponse) => {
  const service = await requireEnabled(req.scope)
  await service.saveSettings(parse(AdminSettings, req.body))
  res.json(await view(req))
})
