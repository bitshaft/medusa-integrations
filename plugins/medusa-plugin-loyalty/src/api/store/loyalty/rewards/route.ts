import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { optionalCustomerId, requireEnabled } from "../../../../lib/loyalty/api/utils"
import { rewardCatalog } from "../../../../lib/loyalty/server/views"

/** `GET /store/loyalty/rewards` — the active rewards; for a signed-in customer also whether they can redeem each and why not. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireEnabled(req)
  res.json({ rewards: await rewardCatalog(req.scope, optionalCustomerId(req)) })
}
