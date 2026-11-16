import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import { describeCoupon } from "../describe"
import { normalizeCode } from "../format"
import { cartProgress, type CartProgress } from "../progress"
import { couponStatus } from "../status"
import type { Locale } from "../types"
import { type CartForCheck, checkCode, codesOnCart, enteredOnCart } from "./checks"
import { loadCoupons, loadKnownPromotions, loadNames, resolveCoupons, resolveQuery } from "./query"
import { statusInput } from "./records"

const CART_FIELDS = [
  "id",
  "email",
  "currency_code",
  "customer_id",
  "original_item_total",
  "completed_at",
  "metadata",
  "customer.id",
  "customer.groups.id",
  "promotions.code",
]

/**
 * The cart for a Store API call. A customer's cart answers only to that
 * customer, and otherwise reads as missing, so its customer's groups,
 * first-order status and past coupon uses stay private. Guest carts stay
 * readable by id, as in Medusa's own cart route.
 */
export async function loadCart(
  container: MedusaContainer,
  cartId: string,
  customerId: string | null
): Promise<CartForCheck> {
  const { data } = await (
    resolveQuery(container) as unknown as { graph: (c: object) => Promise<{ data: CartForCheck[] }> }
  ).graph({ entity: "cart", fields: CART_FIELDS, filters: { id: cartId } })
  const cart = data[0]
  const owner = cart?.customer_id ?? cart?.customer?.id ?? null
  if (!cart || (owner && owner !== customerId)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Cart ${cartId} was not found. If it belongs to a customer account, send the request signed in as that customer.`
    )
  }
  return cart
}

export type StoreCheckResult =
  | { valid: true; code: string; description: string; automatic: false }
  | {
      valid: false
      code: string
      reason: string
      message: string
      messages: Record<Locale, string>
      min_subtotal: number | null
    }
  | { valid: null; code: string; message: string }

/**
 * `POST /store/coupons/check`: whether a code would be accepted on this
 * cart, and if not why, in the customer's language. Nothing is changed.
 */
export async function checkForStore(
  container: MedusaContainer,
  input: { cart_id: string; code: string; customer_id: string | null },
  locale: Locale
): Promise<StoreCheckResult> {
  const cart = await loadCart(container, input.cart_id, input.customer_id)
  const code = normalizeCode(input.code)
  const result = await checkCode(container, cart, input.code)
  if (result.result === "foreign") {
    // A promotion created outside this plugin: core decides when it is added.
    return {
      valid: null,
      code,
      message:
        locale === "pl"
          ? "Ten kod nie jest zarządzany przez panel kuponów; sklep sprawdzi go po dodaniu do koszyka."
          : "This code is not managed by the coupon panel; the store checks it when it is added to the cart.",
    }
  }
  if (result.result === "rejected") {
    return {
      valid: false,
      code,
      reason: result.reason,
      message: result.message[locale],
      messages: result.message,
      min_subtotal: result.min_subtotal,
    }
  }
  const { timeZone } = await resolveCoupons(container).getOptions()
  const names = await loadNames(container, {
    categories: result.coupon.draft.category_ids,
    groups: [],
    products: result.coupon.draft.buy_product_ids,
  })
  return {
    valid: true,
    code,
    automatic: false,
    description: describeCoupon(result.coupon.draft, locale, { names, timeZone }),
  }
}

/**
 * `GET /store/coupons/progress`: tiers and free shipping thresholds that
 * apply to this cart: the tiered coupons the customer entered, and the
 * automatic offers open to everyone. Coupons limited to groups or chosen
 * customers are left out, so nothing private is shown.
 */
export async function progressForStore(
  container: MedusaContainer,
  cartId: string,
  customerId: string | null
): Promise<CartProgress> {
  const cart = await loadCart(container, cartId, customerId)
  const now = new Date()
  const entered = new Set(enteredOnCart(cart))
  const onCart = codesOnCart(cart)
  const known = await loadKnownPromotions(container, onCart)
  const groupsOnCart = new Set(
    onCart.map((code) => known.get(code)?.coupon?.coupons_group).filter((g): g is string => !!g)
  )

  const coupons = (await loadCoupons(container)).filter((coupon) => {
    if (coupon.batch_size != null) return false
    if (couponStatus(statusInput(coupon), now) !== "active") return false
    const onThisCart = entered.has(coupon.code) || groupsOnCart.has(coupon.code)
    const openToAll = coupon.automatic && coupon.draft.audience === "all" && !coupon.draft.first_order_only
    if (!onThisCart && !openToAll) return false
    return !!coupon.draft.tiers?.length || coupon.kind === "free_shipping"
  })

  return cartProgress(
    Number(cart.original_item_total ?? 0),
    coupons.map((coupon) => ({
      code: coupon.automatic ? null : coupon.code,
      kind: coupon.kind,
      tiers: coupon.draft.tiers,
      min_subtotal: coupon.draft.min_subtotal,
    }))
  )
}
