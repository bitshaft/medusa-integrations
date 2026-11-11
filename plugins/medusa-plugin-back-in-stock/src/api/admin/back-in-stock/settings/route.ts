import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveEnabled } from "../../../../lib/back-in-stock/api/utils"
import { DEFAULT_CONSENT } from "../../../../lib/back-in-stock/copy"
import { parseSettingsUpdate } from "../../../../lib/back-in-stock/settings"

async function describe(req: MedusaRequest) {
  const { service, options } = await resolveEnabled(req)
  const settings = await service.getSettings()
  const { consent, overridden, ...values } = settings
  return {
    settings: values,
    consent,
    overridden,
    /** The values from medusa-config.ts that "reset" goes back to. */
    defaults: { ...options.settings, consentText: { ...DEFAULT_CONSENT, ...options.settings.consentText } },
  }
}

/** `GET /admin/back-in-stock/settings` — the settings in effect, which were changed here, and the defaults. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await describe(req))
}

/**
 * `POST /admin/back-in-stock/settings` — saves any subset of the settings.
 * `{ "reset": true }` removes every change, so the plugin options apply again.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  if (body.reset === true) {
    await service.saveSettings({})
    return res.json(await describe(req))
  }
  const parsed = parseSettingsUpdate(body, await service.getStoredSettings())
  if ("error" in parsed) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `The settings could not be saved: ${parsed.error}`)
  }
  await service.saveSettings(parsed.value as Record<string, unknown>)
  res.json(await describe(req))
}
