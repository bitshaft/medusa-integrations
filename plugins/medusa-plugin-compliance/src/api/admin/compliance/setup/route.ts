import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { type SetupStep, setupStep } from "../../../../lib/compliance/kit/setup"
import { LAWYER_PLACEHOLDER } from "../../../../lib/compliance/settings"
import { resolveCompliance } from "../../../../lib/compliance/server/runtime"

/**
 * `GET /admin/compliance/setup`: the installation steps for the Guide tab,
 * with their status detected from this store; steps of a module that is
 * switched off are left out. Texts live in the admin translations.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveCompliance(req.scope)
  if (!(await service.isEnabled())) {
    return res.json({ steps: [setupStep("install", false)] })
  }
  const settings = await service.getSettings()
  const { modules } = settings
  const [[, products], [, incomplete], [, manufacturers], [, consentTypes], omnibusStartedAt] = await Promise.all([
    service.listAndCountComplianceProductSafeties({}, { take: 1, select: ["id"] }),
    service.listAndCountComplianceProductSafeties({ complete: false }, { take: 1, select: ["id"] }),
    service.listAndCountComplianceManufacturers({}, { take: 1, select: ["id"] }),
    service.listAndCountComplianceConsentTypes({}, { take: 1, select: ["id"] }),
    service.omnibusStartedAt(),
  ])

  const steps: SetupStep[] = [setupStep("install", true)]
  if (modules.gpsr) {
    steps.push(
      setupStep("manufacturers", manufacturers > 0),
      setupStep("gpsrProducts", products > 0 && incomplete === 0, { params: { incomplete, products } })
    )
  }
  if (modules.gdpr) {
    steps.push(
      setupStep("gdprLinks", Boolean(settings.gdpr.verify_url && settings.gdpr.privacy_policy_url)),
      setupStep("gdprNotice", settings.gdpr.request_notice !== LAWYER_PLACEHOLDER),
      setupStep("consents", consentTypes > 0),
      // Verification e-mails are sent by whatever listens to the plugin's events: nothing here shows it.
      setupStep("gdprEmails", null)
    )
  }
  if (modules.omnibus) {
    steps.push(
      setupStep("omnibusStarted", Boolean(omnibusStartedAt)),
      // The lowest price is shown by the storefront; the plugin cannot see it.
      setupStep("omnibusStorefront", null, { params: { days: settings.omnibus.period_days } })
    )
  }
  steps.push(setupStep("lawyer", null), setupStep("production", !settings.demo))
  res.json({ steps })
}
