import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { emailsTemplateAvailable } from "../../../../lib/back-in-stock/deliver"
import { EMAILS_CONFIRM_TYPE, EMAILS_RESTOCK_TYPE } from "../../../../lib/back-in-stock/emails-template"
import { readPackageVersion } from "../../../../lib/back-in-stock/kit/package-info"
import { PACKAGE_NAME } from "../../../../lib/back-in-stock/options"
import { resolveBackInStock } from "../../../../lib/back-in-stock/runtime"

/**
 * `GET /admin/back-in-stock/status` — the top of the plugin's page: enabled
 * or why not, demo mode, how emails are sent, links, and counts.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveBackInStock(req.scope)
  const version = readPackageVersion(PACKAGE_NAME, __dirname)
  if (!(await service.isEnabled())) {
    return res.json({ enabled: false, disabled_reason: await service.getDisabledReason(), version })
  }

  const options = await service.getOptions()
  const count = async (filters: Record<string, unknown>) =>
    (await service.listAndCountBackInStockSubscriptions(filters, { take: 1, select: ["id"] }))[1]
  const [active, pending, ended, demo, checks, emailsRestock, emailsConfirm] = await Promise.all([
    count({ status: "active", demo: false }),
    count({ status: "pending", demo: false }),
    count({ status: ["purchased", "unsubscribed", "expired"], demo: false }),
    count({ demo: true }),
    service.listAndCountBackInStockPendingChecks({}, { take: 1, select: ["id"] }).then(([, total]) => total),
    emailsTemplateAvailable(req.scope, options, EMAILS_RESTOCK_TYPE),
    emailsTemplateAvailable(req.scope, options, EMAILS_CONFIRM_TYPE),
  ])

  res.json({
    enabled: true,
    version,
    demo: options.demo,
    sending: {
      // Through @bitshaft/medusa-plugin-emails when its template is registered, else the built-in template.
      restock: options.demo ? "demo" : emailsRestock ? "emails" : "notification",
      confirm: options.demo ? "demo" : emailsConfirm ? "emails" : "notification",
      emails_option: options.emails,
      channel: options.channel,
    },
    links: {
      backend_url: options.backendUrl ?? null,
      storefront_url: options.storefrontUrl ?? null,
      product: options.urls.product,
      confirm: options.urls.confirm ?? null,
      unsubscribe: options.urls.unsubscribe ?? null,
    },
    counts: { active, pending, ended, demo, pending_checks: checks },
  })
}
