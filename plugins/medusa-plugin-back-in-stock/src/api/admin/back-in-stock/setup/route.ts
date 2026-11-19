import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { emailsTemplateAvailable } from "../../../../lib/back-in-stock/deliver"
import { EMAILS_RESTOCK_TYPE } from "../../../../lib/back-in-stock/emails-template"
import { setupStep } from "../../../../lib/back-in-stock/kit/setup"
import { resolveBackInStock } from "../../../../lib/back-in-stock/runtime"

/**
 * `GET /admin/back-in-stock/setup`: the installation steps for the Guide
 * tab, with their status detected from this store. Texts live in the admin
 * translations.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveBackInStock(req.scope)
  if (!(await service.isEnabled())) {
    return res.json({ steps: [setupStep("install", false), setupStep("links", false)] })
  }
  const options = await service.getOptions()
  const settings = await service.getSettings()
  const [viaEmails, [, subscriptions], [, sent]] = await Promise.all([
    emailsTemplateAvailable(req.scope, options, EMAILS_RESTOCK_TYPE),
    service.listAndCountBackInStockSubscriptions({ demo: false }, { take: 1, select: ["id"] }),
    service.listAndCountBackInStockNotifications({ status: "sent" }, { take: 1, select: ["id"] }),
  ])

  res.json({
    steps: [
      setupStep("install", true),
      setupStep("links", Boolean(options.storefrontUrl || (options.urls.confirm && options.urls.unsubscribe))),
      // With the emails plugin the template is there to see; a bare notification provider is not.
      viaEmails
        ? setupStep("sending", true, { params: { channel: options.channel } })
        : setupStep("sending", null, { params: { channel: options.channel } }),
      setupStep("storefront", subscriptions > 0),
      setupStep("doubleOptIn", settings.doubleOptIn, { optional: true }),
      setupStep("firstEmail", sent > 0),
      setupStep("production", !options.demo),
    ],
  })
}
