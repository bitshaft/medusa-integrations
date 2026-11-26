import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveApaczka } from "../../../../lib/apaczka/api/utils"

/**
 * `GET /admin/apaczka/points` — the stored parcel point lists: per carrier
 * and country, how many points, when they were last synced and whether the
 * last sync failed. Also the point types the account offers, for "Sync now".
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const catalog = await resolveApaczka(req).getCatalog()
  const [lists, types] = await Promise.all([catalog.pointStatuses(), catalog.getPointTypes().catch(() => [])])
  res.json({ lists, types })
}
