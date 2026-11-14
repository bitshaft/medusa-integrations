import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { groupParam, localeParam, parseCopy, resolveEnabled } from "../../../../../../lib/emails/api/utils"
import type { AdminPreviewTypeBody } from "../../../../../../lib/emails/api/validators"
import { buildPreview } from "../../../../../../lib/emails/preview"
import { renderEmail } from "../../../../../../lib/emails/render"
import { loadStoreName } from "../../../../../../lib/emails/send"

/**
 * `POST /admin/emails/types/:type/preview` — renders the email with a real
 * order from the store (the given one, else the newest; a made-up order
 * when there are none). Pass `copy` to see unsaved edits. Nothing is sent.
 */
export async function POST(req: MedusaRequest<AdminPreviewTypeBody>, res: MedusaResponse) {
  const { options, settings, languages } = await resolveEnabled(req)
  const type = groupParam(req, options)
  const body = req.validatedBody
  const locale = localeParam(body.locale, languages)

  const { loaded, order } = await buildPreview(req.scope, options, { type, locale, orderId: body.order_id })
  const rendered = await renderEmail({
    options,
    type,
    locale,
    data: loaded.data,
    overrides: {
      type: body.copy ? parseCopy(options, type, body.copy, languages) : settings.types[type]?.copy,
      common: settings.common_copy,
    },
    storeName: await loadStoreName(req.scope),
  })

  res.json({ preview: { ...rendered, locale, to: loaded.to ?? null, order } })
}
