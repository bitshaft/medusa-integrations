import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireEnabled } from "../../../../../lib/loyalty/api/utils"
import { LoyaltyError } from "../../../../../lib/loyalty/messages"
import { resetLoyaltyDemo } from "../../../../../lib/loyalty/server/demo"

/**
 * `POST /admin/loyalty/demo/reset` — "Restore test data", demo mode only:
 * replaces every loyalty record with the demo set.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = await requireEnabled(req)
  if (!(await service.getOptions()).demo) throw new LoyaltyError("demo_only")
  res.json(await resetLoyaltyDemo(req.scope, { actorId: req.auth_context?.actor_id ?? null }))
}
