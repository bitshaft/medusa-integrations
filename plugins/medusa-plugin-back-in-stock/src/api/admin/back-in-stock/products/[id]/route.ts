import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { classifyAvailability } from "../../../../../lib/back-in-stock/availability"
import { resolveEnabled } from "../../../../../lib/back-in-stock/api/utils"

/**
 * `GET /admin/back-in-stock/products/:id` — for the product page widget:
 * people waiting per variant (active and pending, demo excluded), and
 * variants that are stock-managed but have no inventory item.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { service } = await resolveEnabled(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "sku", "manage_inventory", "allow_backorder", "inventory_items.inventory_item_id"],
    filters: { product_id: req.params.id },
  })
  const variants = data as unknown as Array<{
    id: string
    title: string | null
    sku: string | null
    manage_inventory: boolean
    allow_backorder: boolean
    inventory_items?: Array<{ inventory_item_id?: string } | null> | null
  }>

  const subscriptions = variants.length
    ? ((await service.listBackInStockSubscriptions(
        { variant_id: variants.map((variant) => variant.id), status: ["pending", "active"], demo: false },
        { take: null, select: ["variant_id", "status", "last_notified_at"] }
      )) as Array<{ variant_id: string; status: string; last_notified_at: Date | null }>)
    : []

  res.json({
    variants: variants.map((variant) => {
      const mine = subscriptions.filter((row) => row.variant_id === variant.id)
      const hasItem = (variant.inventory_items ?? []).some((link) => Boolean(link?.inventory_item_id))
      const { reason } = classifyAvailability(variant, hasItem ? 0 : null, 1)
      const notified = mine
        .map((row) => row.last_notified_at)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      return {
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        waiting: mine.filter((row) => row.status === "active").length,
        pending: mine.filter((row) => row.status === "pending").length,
        last_notified_at: notified[0] ?? null,
        problem: reason === "no_inventory_item" && mine.length > 0 ? "no_inventory_item" : null,
      }
    }),
  })
}
