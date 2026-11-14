import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { customerId, requestLocale, requireEnabled } from "../../../../lib/loyalty/api/utils"
import type { StoreBirthday } from "../../../../lib/loyalty/api/validators"
import { setBirthday } from "../../../../lib/loyalty/server/actions"

/**
 * `POST /store/loyalty/birthday` with `{ birthday: "1990-05-17" }` (or
 * `"--05-17"` without the year). It can be changed again only after the
 * interval set in the admin.
 */
export async function POST(req: MedusaRequest<StoreBirthday>, res: MedusaResponse) {
  await requireEnabled(req)
  const locale = await requestLocale(req, req.validatedBody.locale)
  const account = await setBirthday(req.scope, customerId(req), req.validatedBody.birthday, locale)
  res.json({ birthday: account.birthday, set_at: account.birthday_set_at })
}
