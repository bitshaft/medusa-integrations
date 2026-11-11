import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { groupParam, resolveEnabled } from "../../../../../../lib/emails/api/utils"
import type { AdminResetTypeBody } from "../../../../../../lib/emails/api/validators"
import { COMMON_GROUP } from "../../../../../../lib/emails/copy"
import { copyKey, typeKey } from "../../../../../../lib/emails/settings"

/**
 * `POST /admin/emails/types/:type/reset` — puts one email type back to its
 * defaults: `scope: "copy"` restores the text, `"all"` also the on/off
 * toggle and the recipients. `confirm` must repeat the type from the URL.
 */
export async function POST(req: MedusaRequest<AdminResetTypeBody>, res: MedusaResponse) {
  const { emails, options } = await resolveEnabled(req)
  const group = groupParam(req, options, { allowCommon: true })
  const { confirm, scope } = req.validatedBody

  if (confirm !== group) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `To reset this email, send "confirm": "${group}". Nothing was changed.`
    )
  }

  await emails.saveSetting(copyKey(group), null)
  if (scope === "all" && group !== COMMON_GROUP) {
    await emails.saveSetting(typeKey(group), null)
  }
  res.json({ type: group, reset: scope })
}
