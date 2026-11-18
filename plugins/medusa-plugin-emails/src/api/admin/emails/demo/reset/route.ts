import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveEnabled } from "../../../../../lib/emails/api/utils"
import { resetEmailsDemo } from "../../../../../lib/emails/demo"

/**
 * `POST /admin/emails/demo/reset` — "Restore test data", demo mode only:
 * replaces the demo rows of the send log. Real rows are kept; nothing is sent.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { emails, options } = await resolveEnabled(req)
  if (!options.demo) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Test data can only be restored in demo mode: set demo: true in the plugin options and restart Medusa."
    )
  }
  res.json(await resetEmailsDemo(req.scope, emails, options))
}
