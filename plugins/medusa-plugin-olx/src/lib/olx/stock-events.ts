import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** Everything that can change whether a variant can be bought. */
export const STOCK_EVENTS = {
  "inventory.inventory-level.created": "inventory_level",
  "inventory.inventory-level.updated": "inventory_level",
  "inventory.inventory-level.deleted": "inventory_level",
  "inventory.reservation-item.created": "reservation",
  "inventory.reservation-item.updated": "reservation",
  "inventory.reservation-item.deleted": "reservation",
  "product-variant.updated": "variant",
  "product-variant.deleted": "variant",
} as const

export type StockEventName = keyof typeof STOCK_EVENTS

const ids = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter((id): id is string => typeof id === "string" && id.length > 0)

/**
 * The variants a stock event may affect, or `"all"` when it cannot be traced
 * (the row is gone). Inventory events carry only the ID of the changed row.
 */
export async function variantsForEvent(
  container: MedusaContainer,
  name: StockEventName,
  data: unknown
): Promise<string[] | "all"> {
  const rowIds = ids((data as { id?: unknown } | undefined)?.id)
  if (!rowIds.length) {
    return "all"
  }
  const entity = STOCK_EVENTS[name]
  if (entity === "variant") {
    return rowIds
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: rows } = await query.graph({
    entity,
    fields: ["id", "inventory_item_id"],
    filters: { id: rowIds },
    withDeleted: true,
  })
  const found = rows as unknown as Array<{ id: string; inventory_item_id?: string | null }>
  if (found.length < rowIds.length) {
    return "all"
  }
  const itemIds = [...new Set(found.map((row) => row.inventory_item_id).filter((id): id is string => Boolean(id)))]
  if (!itemIds.length) {
    return []
  }
  const { data: links } = await query.graph({
    entity: "product_variant_inventory_items",
    fields: ["variant_id"],
    filters: { inventory_item_id: itemIds },
  })
  return [...new Set((links as unknown as Array<{ variant_id: string }>).map((link) => link.variant_id))]
}
