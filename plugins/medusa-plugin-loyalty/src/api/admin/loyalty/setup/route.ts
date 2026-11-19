import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { setupStep } from "../../../../lib/loyalty/kit/setup"
import { resolveLoyalty } from "../../../../lib/loyalty/server/runtime"

/**
 * `GET /admin/loyalty/setup`: the installation steps for the Guide tab, with
 * their status detected from this store. Texts live in the admin
 * translations.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveLoyalty(req.scope)
  if (!(await service.isEnabled())) {
    return res.json({ steps: [setupStep("install", false)] })
  }
  const options = await service.getOptions()
  const settings = await service.getSettings()
  const [[, rewards], [, earned]] = await Promise.all([
    service.listAndCountLoyaltyRewards({ active: true }, { take: 1, select: ["id"] }),
    service.listAndCountLoyaltyEntries({ reason: "earn" }, { take: 1, select: ["id"] }),
  ])
  const { actions } = settings

  res.json({
    steps: [
      setupStep("install", true),
      setupStep("program", settings.enabled),
      setupStep("earning", settings.earn.points > 0),
      setupStep("rewards", rewards > 0, { params: { count: rewards } }),
      setupStep("terms", Boolean(settings.terms_url)),
      setupStep("tiers", settings.tiers.levels.length > 0, { optional: true }),
      setupStep(
        "actions",
        actions.signup.enabled || actions.first_order.enabled || actions.birthday.enabled || actions.newsletter.enabled,
        { optional: true }
      ),
      // Balance and rewards are shown by the storefront; the plugin cannot see it.
      setupStep("storefront", null),
      setupStep("firstPoints", earned > 0),
      setupStep("production", !options.demo),
    ],
  })
}
