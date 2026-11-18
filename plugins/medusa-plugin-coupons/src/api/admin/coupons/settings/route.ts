import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import type { AdminSettings } from "../../../../lib/coupons/api/validators"
import { readPackageVersion } from "../../../../lib/coupons/kit/package-info"
import { PACKAGE_NAME } from "../../../../lib/coupons/options"
import { resolveCoupons } from "../../../../lib/coupons/server/query"

const version = () => readPackageVersion(PACKAGE_NAME, __dirname)

/**
 * `GET /admin/coupons/settings` — whether the plugin runs, its options, and
 * the settings the admin can change (with the starting values). Answers
 * even when the plugin is disabled, so the page can show why.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveCoupons(req.scope)
  if (!(await service.isEnabled())) {
    res.json({ enabled: false, disabled_reason: await service.disabledReason(), version: version() })
    return
  }
  const options = await service.getOptions()
  res.json({
    enabled: true,
    version: version(),
    options: {
      timeZone: options.timeZone,
      defaultLocale: options.defaultLocale,
      maxBatchSize: options.maxBatchSize,
      checkRateLimitPerMinute: options.checkRateLimitPerMinute,
      demo: options.demo,
    },
    settings: await service.getSettings(),
    defaults: options.settings,
  })
}

/** `POST /admin/coupons/settings` — saves the changed settings; `{}` goes back to the plugin options. */
export async function POST(req: MedusaRequest<AdminSettings>, res: MedusaResponse) {
  const service = resolveCoupons(req.scope)
  await service.getOptions()
  const settings = await service.saveSettings(req.validatedBody)
  res.json({ settings })
}
