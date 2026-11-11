import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../../../lib/emails/api/utils"
import { resendEmailsMessageWorkflow } from "../../../../../../workflows/emails/resend-emails-message"

/**
 * `POST /admin/emails/messages/:id/resend` — sends a logged email again to
 * the same address, as a new log entry with the order's current data.
 * Emails that carried a one-time link or code cannot be resent.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await resolveEnabled(req)
  const { result } = await resendEmailsMessageWorkflow(req.scope).run({ input: { message_id: req.params.id } })
  const [message] = result.messages
  res.json({
    status: result.status,
    reason: result.reason ?? null,
    error: message?.error ?? null,
    message_id: message?.id ?? null,
  })
}
