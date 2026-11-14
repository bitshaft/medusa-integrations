import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { adminActor, isDemo, requireModule } from "../../../../../../lib/compliance/api/utils"
import type { AdminExportQuery } from "../../../../../../lib/compliance/api/validators"
import { canDo } from "../../../../../../lib/compliance/requests"
import { sendExport } from "../../../../../../lib/compliance/api/send-export"
import { collectCustomerData } from "../../../../../../lib/compliance/server/export"
import { addRequestEvent, getRequest } from "../../../../../../lib/compliance/server/requests"
import type { RequestStatus } from "../../../../../../lib/compliance/types"

/**
 * `GET /admin/compliance/requests/:id/export?format=zip|json`: the data
 * package for an access or portability request. Every download is noted in
 * the request history.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await requireModule(req, "gdpr")
  if (await isDemo(req)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Demo mode is on: exports use real data, so they are switched off."
    )
  }
  const { format } = req.validatedQuery as unknown as AdminExportQuery
  const { request } = await getRequest(req.scope, req.params.id)
  if (!canDo(request.status as RequestStatus, "export", request.type)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Exports are for verified access and portability requests. Accept the request first if it is still unverified."
    )
  }
  const data = await collectCustomerData(req.scope, { customer_id: request.customer_id, email: request.email })
  await addRequestEvent(req.scope, request.id, "exported", adminActor(req), null, { format })
  sendExport(res, data, format, request.id)
}
