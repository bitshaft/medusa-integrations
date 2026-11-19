import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { expectedMode } from "../../../../lib/stripe/checks"
import { readPackageVersion } from "../../../../lib/stripe/kit/package-info"
import { PACKAGE_NAME } from "../../../../lib/stripe/options"
import { resolveStripe } from "../../../../lib/stripe/server/runtime"

/**
 * `GET /admin/stripe/status`: whether the plugin works, demo mode, the key
 * (kind, mode and last four characters only) and the options. Never the key.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveStripe(req.scope)
  const options = service.getOptions()
  res.json({
    enabled: service.isEnabled(),
    disabled_reason: service.disabledReason(),
    demo: service.isDemo(),
    version: readPackageVersion(PACKAGE_NAME, __dirname),
    key: service.keyInfo(),
    expected_mode: expectedMode(options.mode, process.env.NODE_ENV),
    options,
  })
}
