import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { resolveApaczka } from "../../../../lib/apaczka/api/utils"
import type { AdminShipmentsQuery } from "../../../../lib/apaczka/api/validators"

/** `GET /admin/apaczka/shipments?order_id=order_123` — shipments with their tracking history. */
export async function GET(req: MedusaRequest<unknown, AdminShipmentsQuery>, res: MedusaResponse) {
  const { order_id, fulfillment_id, status, limit, offset } = req.validatedQuery as AdminShipmentsQuery

  const filters: Record<string, unknown> = {}
  if (order_id) filters.order_id = order_id
  if (fulfillment_id) filters.fulfillment_id = fulfillment_id
  if (status) filters.status = status.split(",")

  const [shipments, count] = await resolveApaczka(req).listAndCountApaczkaShipments(filters, {
    relations: ["events"],
    order: { created_at: "DESC" },
    take: limit,
    skip: offset,
  })

  res.json({
    shipments: shipments.map((shipment) => ({
      ...shipment,
      events: [...(shipment.events ?? [])].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
      ),
    })),
    count,
    limit,
    offset,
  })
}
