import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveApaczka } from "../../../../../lib/apaczka/api/utils"
import type { AdminSyncPoints } from "../../../../../lib/apaczka/api/validators"

/**
 * `POST /admin/apaczka/points/sync` `{ type, country_code? }` — syncs one
 * carrier's parcel points now and returns the list's state. Searches do
 * this on their own when a list is missing or old; this fills a list in
 * advance, so the first customer doesn't wait.
 */
export async function POST(req: MedusaRequest<AdminSyncPoints>, res: MedusaResponse) {
  const { type, country_code } = req.validatedBody
  const list = await (await resolveApaczka(req).getCatalog()).refreshPoints(type, country_code)
  res.json({ list })
}
