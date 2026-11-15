import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEmails } from "../../../../lib/emails/api/utils"
import { loadLanguages } from "../../../../lib/emails/languages"

type Status = "done" | "todo" | "optional"

/**
 * `GET /admin/emails/guide`: the rollout steps with their status detected
 * from this store. Texts live in the admin translations.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const emails = resolveEmails(req)
  if (!(await emails.isEnabled())) {
    return res.json({ steps: [{ id: "install", status: "todo" }] })
  }
  const options = await emails.getOptions()
  const settings = await emails.getSettings()
  const languages = await loadLanguages(req.scope, options)
  const [sent] = await emails.listEmailsMessages({ status: "sent" }, { take: 1, select: ["id"] })
  const edited = Object.values(settings.types).some((type) => Object.keys(type.copy).length > 0)
  const themed = Object.keys(settings.theme).length > 0 || Boolean(options.brand.logoUrl)
  const step = (id: string, status: Status, params?: Record<string, string | number>) => ({ id, status, params })

  res.json({
    steps: [
      step("install", "done"),
      step("provider", options.demo ? "todo" : "done", { channel: options.channel }),
      step("links", options.storefrontUrl && options.adminUrl ? "done" : "todo"),
      step("team", settings.team_recipients.length ? "done" : "todo", { count: settings.team_recipients.length }),
      step("appearance", themed ? "done" : "optional"),
      step("texts", edited ? "done" : "optional"),
      step("languages", languages.locales.length > 1 ? "done" : "optional", { count: languages.locales.length }),
      step("test", sent ? "done" : "todo"),
      step("production", options.demo ? "todo" : "done"),
    ],
  })
}
