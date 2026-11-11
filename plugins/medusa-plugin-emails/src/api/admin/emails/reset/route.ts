import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../lib/emails/api/utils"

/**
 * `POST /admin/emails/reset` with `{ "confirm": "RESET" }` — removes every
 * change made in the admin: toggles, recipients, the low stock threshold and
 * all edited text. The send log is kept. The body is checked by the
 * middleware, so the call cannot happen by accident.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { emails } = await resolveEnabled(req)
  const rows = await emails.listEmailsSettings({}, { select: ["id"], take: null })
  if (rows.length) {
    await emails.deleteEmailsSettings(rows.map((row) => row.id))
  }
  res.json({ reset: rows.length })
}
