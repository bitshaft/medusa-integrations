import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import {
  describeCopy,
  describeType,
  groupParam,
  mergeHidden,
  parseCopy,
  resolveEnabled,
  storedCopy,
} from "../../../../../lib/emails/api/utils"
import type { AdminUpdateTypeBody } from "../../../../../lib/emails/api/validators"
import { COMMON_GROUP } from "../../../../../lib/emails/copy"
import type { EmailLanguages } from "../../../../../lib/emails/locales"
import type { EmailsPluginOptions } from "../../../../../lib/emails/options"
import { getDefinition } from "../../../../../lib/emails/registry"
import {
  cleanRecipients,
  copyKey,
  type EmailsSettings,
  type StoredType,
  typeKey,
} from "../../../../../lib/emails/settings"

function describe(options: EmailsPluginOptions, settings: EmailsSettings, group: string, languages: EmailLanguages) {
  return {
    ...(group === COMMON_GROUP ? { type: COMMON_GROUP } : describeType(options, settings, group, languages)),
    ...describeCopy(options, settings, group, languages),
  }
}

/**
 * `GET /admin/emails/types/:type` — one email type with its text in every
 * store language (current value, default and original text per field, and
 * how many fields each language misses) and the variables the text may use. `:type` can be `common` for the labels all emails share.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { options, settings, languages } = await resolveEnabled(req)
  const group = groupParam(req, options, { allowCommon: true })
  res.json({ email_type: describe(options, settings, group, languages) })
}

/**
 * `POST /admin/emails/types/:type` — switches a type on or off, sets the
 * recipients of a store team alert, and saves edited text. `copy` replaces
 * the stored edits of the store's languages: fields left out or equal to the
 * default go back to the default text. Edits of languages the store does not
 * have (any more) are kept.
 */
export async function POST(req: MedusaRequest<AdminUpdateTypeBody>, res: MedusaResponse) {
  const { emails, options, settings, languages } = await resolveEnabled(req)
  const group = groupParam(req, options, { allowCommon: true })
  const body = req.validatedBody

  if (group === COMMON_GROUP && (body.enabled !== undefined || body.recipients !== undefined)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The shared labels only have text; they cannot be switched off"
    )
  }

  if (body.copy !== undefined) {
    const edits = parseCopy(options, group, body.copy, languages)
    await emails.saveSetting(copyKey(group), mergeHidden(storedCopy(settings, group), edits, languages))
  }

  if (group !== COMMON_GROUP && (body.enabled !== undefined || body.recipients !== undefined)) {
    const definition = getDefinition(options, group)!
    const current = settings.types[group]
    const next: StoredType = {
      ...(current.enabled_overridden ? { enabled: current.enabled } : {}),
      ...(current.recipients?.length ? { recipients: current.recipients } : {}),
    }
    if (body.enabled !== undefined) {
      next.enabled = body.enabled
    }
    if (body.recipients !== undefined) {
      if (definition.audience !== "team") {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Only store team emails have recipients; customer emails go to the customer"
        )
      }
      const recipients = cleanRecipients(body.recipients) ?? []
      if (recipients.length) {
        next.recipients = recipients
      } else {
        delete next.recipients
      }
    }
    await emails.saveSetting(typeKey(group), next)
  }

  res.json({ email_type: describe(options, await emails.getSettings(), group, languages) })
}
