import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveApaczka, sendDocument } from "../../../../lib/apaczka/api/utils"
import type { AdminTurnIn } from "../../../../lib/apaczka/api/validators"

/**
 * `POST /admin/apaczka/turn-in` — collective hand-over (turn-in) confirmation
 * PDF for the given shipments, signed by the courier at pickup.
 */
export async function POST(req: MedusaRequest<AdminTurnIn>, res: MedusaResponse) {
  const apaczka = resolveApaczka(req)
  const shipments = await apaczka.listApaczkaShipments({ id: req.validatedBody.shipment_ids })
  const orderIds = shipments.map((s) => s.apaczka_order_id).filter((id): id is string => Boolean(id))

  if (!orderIds.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "None of the selected shipments exist in Apaczka yet")
  }

  const { turn_in } = await (await apaczka.getClient()).getTurnIn(orderIds)
  sendDocument(res, {
    base64: turn_in,
    contentType: "application/pdf",
    fileName: `apaczka-turn-in-${new Date().toISOString().slice(0, 10)}.pdf`,
  })
}
