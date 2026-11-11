import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { OPEN_STATUSES } from "../../modules/back-in-stock/models/subscription"
import { resolveBackInStock } from "./runtime"
import { type Pair, pairKey } from "./types"

/** Stock-related events the plugin listens to, and what their `id` refers to. */
export const STOCK_EVENTS = {
  "inventory.inventory-level.created": "inventory_level",
  "inventory.inventory-level.updated": "inventory_level",
  "inventory.inventory-level.deleted": "inventory_level",
  "inventory.reservation-item.created": "reservation",
  "inventory.reservation-item.updated": "reservation",
  "inventory.reservation-item.deleted": "reservation",
  "product-variant.updated": "variant",
} as const

export type StockEventName = keyof typeof STOCK_EVENTS

const ids = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter((id): id is string => typeof id === "string" && id.length > 0)

/**
 * The variants a stock event may affect, or `"all"` when the event cannot be
 * traced (a level or reservation already gone). Inventory events carry only
 * the ID of the changed row, so the row is read back, deleted rows included.
 */
export async function variantsForEvent(
  container: MedusaContainer,
  name: StockEventName,
  data: Record<string, unknown> | undefined
): Promise<string[] | "all"> {
  const rowIds = ids(data?.id)
  if (!rowIds.length) {
    return []
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
  // Kits: one inventory item can belong to several variants.
  const { data: links } = await query.graph({
    entity: "product_variant_inventory_items",
    fields: ["variant_id"],
    filters: { inventory_item_id: itemIds },
  })
  return [...new Set((links as unknown as Array<{ variant_id: string }>).map((link) => link.variant_id))]
}

/**
 * Variant and sales channel pairs someone is waiting for (pending or active
 * subscriptions). Variants nobody waits for are never tracked.
 */
export async function openPairs(container: MedusaContainer, variantIds: string[] | "all"): Promise<Pair[]> {
  if (variantIds !== "all" && !variantIds.length) {
    return []
  }
  const service = resolveBackInStock(container)
  const rows = (await service.listBackInStockSubscriptions(
    { status: OPEN_STATUSES, ...(variantIds === "all" ? {} : { variant_id: variantIds }) },
    { take: null, select: ["variant_id", "sales_channel_id"] }
  )) as unknown as Pair[]
  const unique = new Map(
    rows.map((row) => [pairKey(row), { variant_id: row.variant_id, sales_channel_id: row.sales_channel_id }])
  )
  return [...unique.values()]
}
