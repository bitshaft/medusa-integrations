import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEnabled } from "../../../../lib/emails/api/utils"
import type { AdminUpdateSettingsBody } from "../../../../lib/emails/api/validators"
import type { EmailsPluginOptions } from "../../../../lib/emails/options"
import { cleanRecipients, type EmailsSettings, GENERAL_KEY, type StoredGeneral } from "../../../../lib/emails/settings"

function describe(options: EmailsPluginOptions, settings: EmailsSettings) {
  return {
    team_recipients: settings.team_recipients,
    team_recipients_overridden: settings.team_recipients_overridden,
    default_team_recipients: options.team.recipients,
    low_stock_threshold: settings.low_stock_threshold,
    low_stock_threshold_overridden: settings.low_stock_threshold_overridden,
    default_low_stock_threshold: options.lowStock.threshold,
  }
}

/** `GET /admin/emails/settings` — store team recipients and the low stock threshold. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { options, settings } = await resolveEnabled(req)
  res.json({ settings: describe(options, settings) })
}

/**
 * `POST /admin/emails/settings` — changes the recipients and/or the
 * threshold. `null` puts a value back to its default from the plugin options.
 */
export async function POST(req: MedusaRequest<AdminUpdateSettingsBody>, res: MedusaResponse) {
  const { emails, options, settings } = await resolveEnabled(req)
  const body = req.validatedBody

  const next: StoredGeneral = {
    ...(settings.team_recipients_overridden ? { team_recipients: settings.team_recipients } : {}),
    ...(settings.low_stock_threshold_overridden ? { low_stock_threshold: settings.low_stock_threshold } : {}),
  }
  if (body.team_recipients === null) {
    delete next.team_recipients
  } else if (body.team_recipients) {
    next.team_recipients = cleanRecipients(body.team_recipients) ?? []
  }
  if (body.low_stock_threshold === null) {
    delete next.low_stock_threshold
  } else if (body.low_stock_threshold !== undefined) {
    next.low_stock_threshold = body.low_stock_threshold
  }

  await emails.saveSetting(GENERAL_KEY, next)
  res.json({ settings: describe(options, await emails.getSettings()) })
}
