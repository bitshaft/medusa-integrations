import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeType, resolveEnabled, storedCopy } from "../../../../lib/emails/api/utils"
import { COMMON_GROUP } from "../../../../lib/emails/copy"
import { LOCALES } from "../../../../lib/emails/locales"
import { listDefinitions } from "../../../../lib/emails/registry"

/** `GET /admin/emails/types` — every email type with its toggle, for the settings page. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { options, settings } = await resolveEnabled(req)
  const common = storedCopy(settings, COMMON_GROUP)
  res.json({
    types: listDefinitions(options).map((definition) => describeType(options, settings, definition.type)),
    common_edited: LOCALES.some((locale) => Object.keys(common[locale] ?? {}).length > 0),
  })
}
