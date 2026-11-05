import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { resolveApaczka, sendDocument } from "../../../../../../utils"

const TYPES = ["waybill", "dispatch_code"] as const

/**
 * `GET /admin/apaczka/orders/:order_id/documents/waybill` — the shipping
 * label (PDF or ZPL). This is the `label_url` stored on Medusa fulfillments.
 *
 * `GET /admin/apaczka/orders/:order_id/documents/dispatch_code` — the drop-off
 * code some carriers require (JSON).
 *
 * Only orders created by this store are served, so the endpoint cannot be
 * used to browse other orders on the same Apaczka account.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { order_id: orderId, type } = req.params
  if (!TYPES.includes(type as (typeof TYPES)[number])) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unknown document type "${type}"`)
  }

  const apaczka = resolveApaczka(req)
  const [shipment] = await apaczka.listApaczkaShipments({ apaczka_order_id: orderId }, { take: 1 })
  if (!shipment) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `No shipment with Apaczka order ${orderId} in this store`)
  }

  const client = apaczka.getClient()

  if (type === "dispatch_code") {
    const result = await client.getDispatchCode(orderId)
    return res.json({ order_id: orderId, dispatch_code: result.dispatch_code ?? null })
  }

  const waybill = await client.getWaybill(orderId)
  const isZpl = waybill.type?.toLowerCase() === "zpl"
  sendDocument(res, {
    base64: waybill.waybill,
    contentType: isZpl ? "application/zpl" : "application/pdf",
    fileName: `apaczka-${shipment.waybill_number ?? orderId}.${isZpl ? "zpl" : "pdf"}`,
    inline: !isZpl && req.query.download !== "true",
  })
}
