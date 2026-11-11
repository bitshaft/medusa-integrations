import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeForCustomer, resolveEnabled } from "../../../../lib/back-in-stock/api/utils"
import type { StoreTokenBody } from "../../../../lib/back-in-stock/api/validators"
import { confirmByToken } from "../../../../lib/back-in-stock/subscriptions"
import { isWellFormedToken } from "../../../../lib/back-in-stock/tokens"

/**
 * `POST /store/back-in-stock/confirm` with `{ token }` — for a storefront
 * page set in `urls.confirm`. `outcome` is `done`, `already` or `invalid`.
 */
export async function POST(req: MedusaRequest<StoreTokenBody>, res: MedusaResponse) {
  await resolveEnabled(req)
  const { token } = req.validatedBody
  const result = isWellFormedToken(token)
    ? await confirmByToken(req.scope, token)
    : { outcome: "invalid" as const, subscription: null }
  res.status(result.outcome === "invalid" ? 404 : 200).json({
    outcome: result.outcome,
    subscription: result.subscription ? describeForCustomer(result.subscription) : null,
  })
}
