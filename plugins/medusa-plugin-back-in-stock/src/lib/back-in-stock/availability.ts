import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, getVariantAvailability } from "@medusajs/framework/utils"

/**
 * Why a variant counts as in or out of stock:
 *
 * - `stock`: stock-managed; `available` units are free in the channel's locations
 * - `untracked`: `manage_inventory` is off, so it can always be ordered
 * - `backorder`: `allow_backorder` is on, so it can be ordered at zero stock
 * - `no_inventory_item`: stock-managed but no inventory item is linked
 *   (a configuration problem: it can never be ordered)
 * - `missing`: the variant does not exist (any more)
 */
export type AvailabilityReason = "stock" | "untracked" | "backorder" | "no_inventory_item" | "missing"

export type VariantAvailability = {
  variant_id: string
  in_stock: boolean
  /** Units available in the channel; `null` when the variant is not stock-managed or has no inventory item. */
  available: number | null
  reason: AvailabilityReason
}

type VariantFlags = { id: string; manage_inventory?: boolean | null; allow_backorder?: boolean | null }

/**
 * Decides availability the way checkout does: not stock-managed and
 * backorderable variants can always be ordered; otherwise the units free
 * in the channel (computed by Medusa's own `getVariantAvailability`, which
 * counts only the channel's stock locations and divides kits by their
 * required quantity) must reach `minQuantity`.
 */
export function classifyAvailability(
  variant: VariantFlags | undefined,
  computed: number | null | undefined,
  minQuantity: number
): Omit<VariantAvailability, "variant_id"> {
  if (!variant) {
    return { in_stock: false, available: null, reason: "missing" }
  }
  if (variant.manage_inventory === false) {
    return { in_stock: true, available: null, reason: "untracked" }
  }
  if (variant.allow_backorder) {
    return { in_stock: true, available: computed ?? null, reason: "backorder" }
  }
  if (computed === null || computed === undefined) {
    return { in_stock: false, available: null, reason: "no_inventory_item" }
  }
  const available = Math.max(0, Math.floor(Number(computed) || 0))
  return { in_stock: available >= minQuantity, available, reason: "stock" }
}

/** Availability of several variants in one sales channel. */
export async function loadAvailability(
  container: MedusaContainer,
  variantIds: string[],
  salesChannelId: string,
  minQuantity: number
): Promise<Map<string, VariantAvailability>> {
  const ids = [...new Set(variantIds)]
  const result = new Map<string, VariantAvailability>()
  if (!ids.length) {
    return result
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: variants }, computed] = await Promise.all([
    query.graph({
      entity: "product_variant",
      fields: ["id", "manage_inventory", "allow_backorder"],
      filters: { id: ids },
    }),
    getVariantAvailability(query, { variant_ids: ids, sales_channel_id: salesChannelId }),
  ])
  const flags = new Map((variants as unknown as VariantFlags[]).map((variant) => [variant.id, variant]))
  for (const id of ids) {
    result.set(id, {
      variant_id: id,
      ...classifyAvailability(flags.get(id), computed[id]?.availability, minQuantity),
    })
  }
  return result
}
