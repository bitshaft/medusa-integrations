import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveWhitelistVat } from "../../../../lib/whitelist-vat/api/utils"
import { setupStep } from "../../../../lib/whitelist-vat/kit/setup"

/**
 * `GET /admin/whitelist-vat/setup`: the installation steps for the Guide
 * tab, with their status detected from this store. Texts live in the admin
 * translations. Never returns the GUS key.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveWhitelistVat(req)
  if (!(await service.isEnabled())) {
    return res.json({ steps: [setupStep("install", false)] })
  }
  const options = await service.getOptions()
  const count = async (filters: Record<string, unknown>) =>
    (await service.listAndCountWhitelistVatChecks(filters, { take: 1, select: ["id"] }))[1]
  const [answered, fromOrders, fromCheckout] = await Promise.all([
    count({ outcome: { $ne: "unavailable" } }),
    count({ order_id: { $ne: null } }),
    count({ trigger_type: "checkout" }),
  ])

  res.json({
    steps: [
      setupStep("install", true),
      setupStep("firstCheck", answered > 0),
      setupStep("taxId", fromOrders > 0, { params: { keys: options.taxIdKeys.join(", ") } }),
      setupStep("checkoutLookup", fromCheckout > 0, { optional: true }),
      setupStep("gus", options.demo || Boolean(options.gus.apiKey), { optional: true }),
      setupStep("vies", Boolean(options.vies.requesterVatNumber), { optional: true }),
      setupStep("reject", options.checkout.rejectOnCompletion, { optional: true }),
      setupStep("production", !options.demo),
    ],
  })
}
