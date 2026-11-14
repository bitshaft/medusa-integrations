import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { isDemo, requireModule } from "../../../../../../lib/compliance/api/utils"
import type { AdminExportQuery } from "../../../../../../lib/compliance/api/validators"
import { collectCustomerData } from "../../../../../../lib/compliance/server/export"
import { sendExport } from "../../../../../../lib/compliance/api/send-export"

/** `GET /admin/compliance/customers/:id/export?format=zip|json`: the same data package, from the customer page. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireModule(req, "gdpr")
  if (await isDemo(req)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Demo mode is on: exports use real data, so they are switched off."
    )
  }
  const { format } = req.validatedQuery as unknown as AdminExportQuery
  sendExport(res, await collectCustomerData(req.scope, { customer_id: req.params.id }), format, req.params.id)
}
