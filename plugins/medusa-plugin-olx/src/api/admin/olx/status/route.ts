import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ensureDemoAdverts } from "../../../../lib/olx/demo-seed"
import { maskIdentifier } from "../../../../lib/olx/kit/secrets"
import { readPackageVersion } from "../../../../lib/olx/kit/package-info"
import { PACKAGE_NAME } from "../../../../lib/olx/options"
import { resolveOlx } from "../../../../lib/olx/runtime"

/** `GET /admin/olx/status` — enabled or why not, the connection, and the options without secrets. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  const version = readPackageVersion(PACKAGE_NAME, __dirname)
  if (!(await service.isEnabled())) {
    return res.json({ enabled: false, disabled_reason: await service.getDisabledReason(), version })
  }
  const options = await service.getOptions()
  await ensureDemoAdverts(req.scope)
  res.json({
    enabled: true,
    version,
    demo: options.demo,
    connection: await service.describeConnection(),
    counts: await service.counts(),
    options: {
      demo: options.demo,
      client_id: maskIdentifier(options.clientId),
      redirect_uri: options.redirectUri ?? null,
      admin_url: options.adminUrl ?? null,
      base_url: options.baseUrl,
      timeout_ms: options.timeoutMs,
    },
  })
}
