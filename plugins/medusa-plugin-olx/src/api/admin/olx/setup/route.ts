import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { setupStep } from "../../../../lib/olx/kit/setup"
import { resolveOlx } from "../../../../lib/olx/runtime"

/** `GET /admin/olx/setup` — the installation steps with what the store shows about each. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveOlx(req.scope)
  const enabled = await service.isEnabled()
  const options = enabled ? await service.getOptions() : null
  const connection = enabled ? await service.describeConnection() : null
  const defaults = enabled ? await service.getDefaults() : null
  const counts = enabled ? await service.counts() : {}
  res.json({
    steps: [
      setupStep("app", enabled && (options?.demo ? null : true)),
      setupStep("options", enabled),
      setupStep("connect", Boolean(connection?.connected && !connection.needs_reconnect)),
      setupStep("defaults", Boolean(defaults?.contact_name && defaults.city_id)),
      setupStep("images", null),
      setupStep("first", Object.keys(counts).length > 0),
    ],
  })
}
