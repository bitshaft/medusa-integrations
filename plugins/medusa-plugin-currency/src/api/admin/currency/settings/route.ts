import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveEnabled } from "../../../../lib/currency/api/utils"
import { loadStoreContext } from "../../../../lib/currency/fill/load"
import { parseSettingsUpdate, ruleFor } from "../../../../lib/currency/settings"

async function describe(req: MedusaRequest) {
  const { service } = await resolveEnabled(req)
  const settings = await service.getSettings()
  const store = await loadStoreContext(req.scope, settings)
  return {
    settings,
    /** Every store currency other than the base, with the rule in effect (saved or default). */
    rules: Object.fromEntries(
      store.currencies.filter((c) => c.code !== store.base?.code).map((c) => [c.code, ruleFor(settings, c.code)])
    ),
    store,
  }
}

/** `GET /admin/currency/settings` — the settings, and the store's currencies, regions and VAT rates they apply to. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await describe(req))
}

/** `POST /admin/currency/settings` — saves the whole settings object. Nothing is recalculated or written to prices. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const parsed = parseSettingsUpdate(req.body ?? {})
  if ("error" in parsed) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `The settings could not be saved: ${parsed.error}`)
  }
  await service.saveSettings(parsed.value)
  res.json(await describe(req))
}
