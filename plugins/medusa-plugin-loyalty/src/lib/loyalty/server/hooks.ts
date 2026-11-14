import { LoyaltyError } from "../messages"
import { GIFT_METADATA_KEY } from "./orders"

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
  const quantity = input.update?.quantity
  if (quantity != null && quantity !== 0 && quantity !== 1) throw new LoyaltyError("reward_gift_quantity")
}
