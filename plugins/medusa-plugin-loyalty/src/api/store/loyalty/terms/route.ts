import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../lib/loyalty/api/utils"

/** `GET /store/loyalty/terms` — the link to the program terms and whether the program runs. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  const settings = await service.getSettings()
  res.json({ terms_url: settings.terms_url, program_enabled: settings.enabled })
}
