import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireModule } from "../../../../../lib/compliance/api/utils"
import { recordPrices } from "../../../../../lib/compliance/server/prices"

/** `POST /admin/compliance/omnibus/record`: checks every price now instead of waiting for the hourly job. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await requireModule(req, "omnibus")
  const rows = await recordPrices(req.scope, { source: "job" })
  res.json({ recorded: rows.length })
}
