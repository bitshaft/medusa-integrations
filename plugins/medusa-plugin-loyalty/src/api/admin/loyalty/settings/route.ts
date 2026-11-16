import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { readPackageVersion } from "../../../../lib/loyalty/kit/package-info"
import { PACKAGE_NAME } from "../../../../lib/loyalty/options"
import { DEFAULT_SETTINGS, settingsSchema } from "../../../../lib/loyalty/settings"
import { programCurrency, resolveLoyalty, storeCurrencies } from "../../../../lib/loyalty/server/runtime"

/** `GET /admin/loyalty/settings` — the program settings, their defaults, and whether the plugin runs. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveLoyalty(req.scope)
  const version = readPackageVersion(PACKAGE_NAME, __dirname)
  if (!(await service.isEnabled())) {
    res.json({ enabled: false, disabled_reason: await service.disabledReason(), version })
    return
  }
  const settings = await service.getSettings()
  res.json({
    enabled: true,
    version,
    options: await service.getOptions(),
    settings,
    defaults: DEFAULT_SETTINGS,
    /** The store's currencies (default first) and the one the program uses now. */
    store_currencies: await storeCurrencies(req.scope),
    currency_code: await programCurrency(req.scope, settings),
  })
}

/** `POST /admin/loyalty/settings` — saves the whole settings form (validated). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveLoyalty(req.scope)
  await service.getOptions()
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".") || "settings"}: ${i.message}`).join("; ")
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid settings: ${message}`)
  }
  res.json({ settings: await service.saveSettings(parsed.data) })
}
