import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { groupParam, resolveEnabled } from "../../../../../../lib/emails/api/utils"
import type { AdminTestTypeBody } from "../../../../../../lib/emails/api/validators"
import { pickLocale } from "../../../../../../lib/emails/locales"
import { buildPreview } from "../../../../../../lib/emails/preview"
import { sendEmail } from "../../../../../../lib/emails/send"

/**
 * `POST /admin/emails/types/:type/test` — sends the email, as the preview
 * shows it with the saved text, to any address. It works for types that are
 * switched off and is marked `[Test]` in the subject and `test` in the send
 * log. In demo mode it is rendered and logged like everything else.
 */
export async function POST(req: MedusaRequest<AdminTestTypeBody>, res: MedusaResponse) {
  const { options } = await resolveEnabled(req)
  const type = groupParam(req, options)
  const body = req.validatedBody
  const locale = pickLocale([body.locale], options.defaultLocale)

  const { loaded } = await buildPreview(req.scope, options, { type, locale, orderId: body.order_id })
  const result = await sendEmail(req.scope, {
    type,
    to: body.to,
    locale,
    trigger: "test",
    force: true,
    prepared: loaded,
    subjectPrefix: "[Test]",
  })

  const [message] = result.messages
  res.json({ status: result.status, reason: result.reason ?? null, error: message?.error ?? null })
}
