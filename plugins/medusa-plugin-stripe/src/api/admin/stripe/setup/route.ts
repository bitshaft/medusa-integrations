import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import type { CheckId, CheckResult } from "../../../../lib/stripe/checks"
import { demoChecks } from "../../../../lib/stripe/demo"
import { setupStep } from "../../../../lib/stripe/kit/setup"
import { runChecks } from "../../../../lib/stripe/server/checks"
import { resolveStripe } from "../../../../lib/stripe/server/runtime"

/**
 * `GET /admin/stripe/setup`: the installation steps for the Guide tab. Their
 * status comes from the same checks as the Checks tab (cached like them),
 * plus whether Medusa has taken a payment through the Stripe provider.
 * Texts live in the admin translations.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveStripe(req.scope)
  const options = service.getOptions()
  const info = service.keyInfo()
  const { checks } = service.isDemo() ? demoChecks() : await runChecks(req.scope, service.reader())
  const verdict = (id: CheckId): CheckResult | undefined => checks.find((c) => c.id === id)
  const ok = (id: CheckId) => verdict(id)?.verdict === "ok"

  let paid = false
  try {
    const payment = req.scope.resolve(Modules.PAYMENT) as unknown as {
      listPayments: (filters: Record<string, unknown>, config: Record<string, unknown>) => Promise<unknown[]>
    }
    paid = (await payment.listPayments({ provider_id: `pp_stripe_${options.providerId}` }, { take: 1 })).length > 0
  } catch {
    paid = false
  }

  res.json({
    steps: [
      setupStep("key", Boolean(info) || service.isDemo()),
      setupStep("permissions", ok("api_key") && !checks.some((c) => c.code === "no_permission")),
      setupStep("options", service.isEnabled()),
      setupStep("provider", ok("provider")),
      setupStep("webhook", ok("webhook")),
      setupStep("methods", ok("payment_methods")),
      setupStep("domains", ok("domains"), { optional: true }),
      setupStep("test", paid),
      setupStep("live", !service.isDemo() && info?.mode === "live" && ok("mode")),
    ],
  })
}
