import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { resolveApaczka } from "../../../../lib/apaczka/api/utils"
import type { AdminShipmentsQuery } from "../../../../lib/apaczka/api/validators"

/**
 * `GET /admin/apaczka/shipments` — shipments with their tracking history,
 * newest first. Filters: `order_id`, `fulfillment_id`, `status` (comma
 * separated), `is_return`, and `q`, which matches a waybill number, an
 * Apaczka order ID, a Medusa order ID or an order number (`1042`, `#1042`).
 * Each shipment carries `order_display_id` for linking to the order.
 */
export async function GET(req: MedusaRequest<unknown, AdminShipmentsQuery>, res: MedusaResponse) {
  const { order_id, fulfillment_id, status, q, is_return, limit, offset } = req.validatedQuery as AdminShipmentsQuery
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const filters: Record<string, unknown> = {}
  if (order_id) filters.order_id = order_id
  if (fulfillment_id) filters.fulfillment_id = fulfillment_id
  if (status) filters.status = status.split(",")
  if (is_return) filters.is_return = is_return === "true"

  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const or: Record<string, unknown>[] = [
      { waybill_number: { $ilike: like } },
      { apaczka_order_id: { $ilike: like } },
      { order_id: q },
    ]
    const displayId = /^#?(\d{1,9})$/.exec(q)?.[1]
    if (displayId) {
      const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id"],
        filters: { display_id: Number(displayId) },
      })
      if (orders.length) {
        or.push({ order_id: orders.map((o) => o.id) })
      }
    }
    filters.$or = or
  }

  const [shipments, count] = await resolveApaczka(req).listAndCountApaczkaShipments(filters, {
    relations: ["events"],
    order: { created_at: "DESC" },
    take: limit,
    skip: offset,
  })

  const orderIds = [...new Set(shipments.map((s) => s.order_id).filter((id): id is string => Boolean(id)))]
  const displayIds = new Map<string, number>()
  if (orderIds.length) {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id"],
      filters: { id: orderIds },
    })
    for (const order of orders) {
      displayIds.set(order.id, order.display_id as number)
    }
  }

  res.json({
    shipments: shipments.map((shipment) => ({
      ...shipment,
      order_display_id: shipment.order_id ? (displayIds.get(shipment.order_id) ?? null) : null,
      events: [...(shipment.events ?? [])].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
      ),
    })),
    count,
    limit,
    offset,
  })
}
