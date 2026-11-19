import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEmails } from "../../../../lib/emails/api/utils"
import { setupStep } from "../../../../lib/emails/kit/setup"
import { loadLanguages } from "../../../../lib/emails/languages"

/**
 * `GET /admin/emails/guide`: the installation steps with their status
 * detected from this store. Texts live in the admin translations.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const emails = resolveEmails(req)
  if (!(await emails.isEnabled())) {
    return res.json({ steps: [setupStep("install", false)] })
  }
  const options = await emails.getOptions()
  const settings = await emails.getSettings()
  const languages = await loadLanguages(req.scope, options)
  const [sent] = await emails.listEmailsMessages({ status: "sent" }, { take: 1, select: ["id"] })
  const edited = Object.values(settings.types).some((type) => Object.keys(type.copy).length > 0)
  const themed = Object.keys(settings.theme).length > 0 || Boolean(options.brand.logoUrl)

  res.json({
    steps: [
      setupStep("install", true),
      setupStep("provider", !options.demo, { params: { channel: options.channel } }),
      setupStep("links", Boolean(options.storefrontUrl && options.adminUrl)),
      setupStep("team", settings.team_recipients.length > 0, { params: { count: settings.team_recipients.length } }),
      setupStep("appearance", themed, { optional: true }),
      setupStep("texts", edited, { optional: true }),
      setupStep("languages", languages.locales.length > 1, {
        optional: true,
        params: { count: languages.locales.length },
      }),
      setupStep("test", Boolean(sent)),
      setupStep("production", !options.demo),
    ],
  })
}
