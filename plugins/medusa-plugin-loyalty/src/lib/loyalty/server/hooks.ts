import type { MedusaContainer } from "@medusajs/framework/types"

import { LoyaltyError } from "../messages"
import { GIFT_METADATA_KEY } from "./orders"
import { graph, resolveLoyalty } from "./runtime"

type Row = Record<string, any>

/**
 * `updateLineItemInCartWorkflow.hooks.validate`: a loyalty gift always has
 * a quantity of 1, so more units cannot be had for the points of one.
 * Removing the gift is fine (that refunds the points).
 */
export function validateGiftQuantity({
  input,
  cart,
}: {
  input: { item_id?: string; update?: { quantity?: number } }
  cart: { items?: Array<{ id: string; metadata?: Record<string, unknown> | null } | null> | null }
}) {
  const item = (cart.items ?? []).find((line) => line?.id === input.item_id)
  if (!item?.metadata?.[GIFT_METADATA_KEY]) return
  refuseGiftQuantity(input.update?.quantity)
}

function refuseGiftQuantity(quantity: unknown) {
  if (quantity != null && Number(quantity) !== 0 && Number(quantity) !== 1) {
    throw new LoyaltyError("reward_gift_quantity")
  }
}

/* Cart guards (Store API middlewares) --------------------------------------- */

/**
 * The plugin's line item metadata keys. A gift line is recognised by them,
 * so customers must not be able to set, change or remove them.
 */
const RESERVED = /^loyalty_/

/** Customers cannot set the plugin's metadata keys on their own lines. */
export function refuseReservedMetadata(metadata: unknown): void {
  if (metadata && typeof metadata === "object" && Object.keys(metadata).some((key) => RESERVED.test(key))) {
    throw new LoyaltyError("reserved_metadata")
  }
}

/** `POST /store/carts`: the same rule for the items a new cart is created with. */
export function refuseReservedItemsMetadata(items: unknown): void {
  if (!Array.isArray(items)) return
  for (const item of items) refuseReservedMetadata((item as Row | null)?.metadata)
}

const CART_FIELDS = [
  "id",
  "customer_id",
  "completed_at",
  "items.id",
  "items.variant_id",
  "items.quantity",
  "items.unit_price",
  "items.metadata",
]

async function loadCart(container: MedusaContainer, cartId: string): Promise<Row | null> {
  const { data } = await graph(container)({ entity: "cart", fields: CART_FIELDS, filters: { id: cartId } })
  return data[0] ?? null
}

/**
 * `POST /store/carts/:id/line-items/:line_id`: a gift line keeps its
 * metadata (it is what marks the line as a gift, and Medusa may replace
 * metadata as a whole) and its quantity of 1. Removing it is fine.
 *
 * This does not rely on the workflow hook, which an app may switch off
 * with `LOYALTY_DISABLE_HOOKS=line-item`.
 */
export async function guardLineItemUpdate(
  container: MedusaContainer,
  cartId: string,
  lineId: string,
  body: Row | null | undefined
): Promise<void> {
  refuseReservedMetadata(body?.metadata)
  const cart = await loadCart(container, cartId)
  const item = ((cart?.items ?? []) as Array<Row | null>).find((line) => line?.id === lineId)
  if (!item?.metadata?.[GIFT_METADATA_KEY]) return
  if (body?.metadata !== undefined) throw new LoyaltyError("reward_gift_locked")
  refuseGiftQuantity(body?.quantity)
}

/**
 * `POST /store/carts/:id/complete`: every line marked as a gift must be one
 * this plugin put there: a redemption of this cart's customer that is still
 * in this cart, with the reward's variant, a quantity of 1 and a price of 0.
 */
export async function validateCartGifts(container: MedusaContainer, cartId: string): Promise<void> {
  const cart = await loadCart(container, cartId)
  if (!cart || cart.completed_at) return
  const marked = ((cart.items ?? []) as Array<Row | null>).filter(
    (item): item is Row => !!item?.metadata?.[GIFT_METADATA_KEY]
  )
  if (!marked.length) return

  const redemptions = await resolveLoyalty(container).listLoyaltyRedemptions({ cart_id: cart.id, status: "in_cart" })
  const seen = new Set<string>()
  for (const item of marked) {
    const redemptionId = String(item.metadata[GIFT_METADATA_KEY])
    const redemption = redemptions.find((r) => r.id === redemptionId)
    const valid =
      !!redemption &&
      !seen.has(redemptionId) &&
      redemption.customer_id === cart.customer_id &&
      redemption.variant_id === item.variant_id &&
      Number(item.quantity) === 1 &&
      Number(item.unit_price) === 0
    if (!valid) throw new LoyaltyError("reward_gift_invalid")
    seen.add(redemptionId)
  }
}
