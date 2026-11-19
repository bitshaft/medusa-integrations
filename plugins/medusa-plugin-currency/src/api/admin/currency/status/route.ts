import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { readPackageVersion } from "../../../../lib/currency/kit/package-info"
import { PACKAGE_NAME } from "../../../../lib/currency/options"
import { resolveCurrency } from "../../../../lib/currency/runtime"

/** `GET /admin/currency/status` — enabled or why not, demo mode, the options in effect, and the history size. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveCurrency(req.scope)
  const version = readPackageVersion(PACKAGE_NAME, __dirname)
  if (!(await service.isEnabled())) {
    return res.json({ enabled: false, disabled_reason: await service.getDisabledReason(), version })
  }
  const options = await service.getOptions()
  const [, runs] = await service.listAndCountCurrencyFillRuns({}, { take: 1, select: ["id"] })
  res.json({
    enabled: true,
    version,
    demo: options.demo,
    options: {
      demo: options.demo,
      provider: options.provider,
      nbp_base_url: options.nbp.baseUrl,
      nbp_timeout_ms: options.nbp.timeoutMs,
      max_variants: options.maxVariants,
    },
    counts: { runs },
  })
}
