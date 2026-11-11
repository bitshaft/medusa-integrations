import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../lib/back-in-stock/api/utils"
import { normalizeLocale } from "../../../../lib/back-in-stock/options"

/**
 * `GET /store/back-in-stock/consent?locale=pl` — the consent text to show
 * next to the "notify me" form, and whether a confirmation email will follow.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service, options } = await resolveEnabled(req)
  const settings = await service.getSettings()
  const locale = normalizeLocale(
    (req.validatedQuery as { locale?: string }).locale ?? req.get("x-medusa-locale"),
    options.defaultLocale
  )
  res.json({ locale, consent_text: settings.consent[locale], double_opt_in: settings.doubleOptIn })
}
