import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { adminRoute, parse } from "../../../../lib/negotiations/api/utils"
import { AdminSettings } from "../../../../lib/negotiations/api/validators"
import { readPackageVersion } from "../../../../lib/negotiations/kit/package-info"
import { PACKAGE_NAME } from "../../../../lib/negotiations/options"
import { type PriceBases, priceBases } from "../../../../lib/negotiations/server/catalog"
import { logger, resolveNegotiations } from "../../../../lib/negotiations/server/runtime"
import { requireEnabled } from "../../../../lib/negotiations/server/threads"

/** Net or gross per region and currency, for the admin's labels; `null` when Medusa's pricing can't be read. */
async function bases(req: MedusaRequest): Promise<PriceBases | null> {
  try {
    return await priceBases(req.scope)
  } catch (error) {
    logger(req.scope).warn(`[negotiations] Could not read the tax-inclusive pricing: ${(error as Error).message}`)
    return null
  }
}

async function view(req: MedusaRequest) {
  const service = resolveNegotiations(req.scope)
  const enabled = await service.isEnabled()
  return {
    enabled,
    disabled_reason: await service.disabledReason(),
    package: PACKAGE_NAME,
    version: readPackageVersion(PACKAGE_NAME, __dirname),
    /** Options from medusa-config, read-only here. */
    options: await service.getOptions(),
    settings: await service.getSettings(),
    price_bases: await bases(req),
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
