import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveEmails } from "../../../../lib/emails/api/utils"
import { readPackageVersion } from "../../../../lib/emails/kit/package-info"
import { LOCALES } from "../../../../lib/emails/locales"
import { addressOf, PACKAGE_NAME } from "../../../../lib/emails/options"
import { loadStoreName } from "../../../../lib/emails/send"

/**
 * `GET /admin/emails/status` — what the settings page shows at the top:
 * whether the plugin is enabled, demo mode, the sender and which links are
 * configured. When the plugin is disabled it returns only the reason.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const emails = resolveEmails(req)
  const version = readPackageVersion(PACKAGE_NAME, __dirname)

  if (!(await emails.isEnabled())) {
    return res.json({ enabled: false, disabled_reason: await emails.getDisabledReason(), version })
  }

  const options = await emails.getOptions()
  res.json({
    enabled: true,
    version,
    demo: options.demo,
    from: options.from,
    from_address: addressOf(options.from),
    reply_to: options.replyTo ?? null,
    channel: options.channel,
    default_locale: options.defaultLocale,
    locales: LOCALES,
    store_name: options.brand.name ?? (await loadStoreName(req.scope)) ?? null,
    storefront_url: options.storefrontUrl ?? null,
    admin_url: options.adminUrl ?? null,
    max_attempts: options.retries.maxAttempts,
  })
}
