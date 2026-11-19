import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { describeCommon, describeType, resolveEnabled } from "../../../../lib/emails/api/utils"
import { listDefinitions } from "../../../../lib/emails/registry"

/**
 * `GET /admin/emails/types` — every email type with its toggle and how many
 * fields the store's languages still miss, for the settings page.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { options, settings, languages } = await resolveEnabled(req)
  const common = describeCommon(options, settings, languages)
  res.json({
    types: listDefinitions(options).map((definition) => describeType(options, settings, definition.type, languages)),
    common_edited: common.edited,
    common_missing_translations: common.missing_translations,
    common_missing_locales: common.missing_locales,
  })
}
