import type { ICartModuleService, MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"

import { buildPromotionContext, CART_METADATA_KEY, enteredTierCodes, type PromotionAction } from "../context"
import { normalizeCode } from "../format"
import { type CartForCheck, checkCode, codesOnCart, enteredOnCart } from "./checks"
import { isFirstOrder, loadKnownPromotions, loadTierGroups, resolveCoupons } from "./query"

type HookContext = { container: MedusaContainer }

function toAction(value: unknown): PromotionAction {
  return value === "remove" || value === "replace" ? value : "add"
}

/** The error a customer sees: Polish and English, so either reader understands it. */
function rejection(message: { pl: string; en: string }): MedusaError {
  return new MedusaError(MedusaError.Types.NOT_ALLOWED, `${message.pl} / ${message.en}`)
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * `updateCartPromotionsWorkflow.hooks.validate`: refuses a code the plugin's
 * rules do not allow, with the reason, before core applies anything; and
 * remembers which tiered coupons the customer entered (in cart metadata),
 * because their levels are automatic promotions opened by that code.
 */
export async function validateCartPromotions(
  { input, cart }: { input: { action?: unknown; promo_codes?: string[] }; cart: CartForCheck },
  { container }: HookContext
): Promise<void> {
  if (!(await resolveCoupons(container).isEnabled())) return
  const action = toAction(input.action)
  const codes = (input.promo_codes ?? []).filter((code) => typeof code === "string" && code.trim())
  const onCart = codesOnCart(cart)
  const entered = enteredOnCart(cart)
  const known = await loadKnownPromotions(container, [...codes, ...onCart])

  if (action === "add") {
    // Check codes one by one against the cart as it will be, so two codes in
    // one request cannot get around exclusivity.
    let working: CartForCheck = { ...cart, promotions: onCart.map((code) => ({ code })) }
    for (const code of codes) {
      const typed = normalizeCode(code)
      if (onCart.includes(code) || onCart.includes(typed) || entered.includes(typed)) continue
      const check = await checkCode(container, working, code, new Date(), { known })
      if (check.result === "rejected") throw rejection(check.message)
      if (check.result === "valid" && check.coupon.tiered) {
        const metadata = { ...(working.metadata ?? {}), [CART_METADATA_KEY]: [...enteredOnCart(working), check.group] }
        working = { ...working, metadata }
      } else {
        working = { ...working, promotions: [...(working.promotions ?? []), { code }] }
      }
    }
  }

  const tierGroups = await loadTierGroups(container, [...codes, ...entered])
  const next = enteredTierCodes(cart, action, codes, known, tierGroups)
  if (!sameList(next, [...entered].sort())) {
    await container.resolve<ICartModuleService>(Modules.CART).updateCarts(cart.id, {
      metadata: { ...(cart.metadata ?? {}), [CART_METADATA_KEY]: next },
    })
  }
}

/**
 * `updateCartPromotionsWorkflow.hooks.setPromotionContext`: the attributes
 * the plugin's promotion rules read (customer, first order, exclusivity,
 * entered tiered codes, item keys). Returned on top of the cart context.
 */
export async function couponsPromotionContext(
  { cart, action, promo_codes }: { cart: CartForCheck & { items?: unknown }; action: unknown; promo_codes: string[] },
  { container }: HookContext
): Promise<Record<string, unknown>> {
  if (!(await resolveCoupons(container).isEnabled())) return {}
  const codes = promo_codes ?? []
  const onCart = codesOnCart(cart)
  const [known, tierGroups, firstOrder] = await Promise.all([
    loadKnownPromotions(container, [...codes, ...onCart]),
    loadTierGroups(container, [...codes, ...enteredOnCart(cart)]),
    isFirstOrder(container, { customer_id: cart.customer?.id ?? cart.customer_id ?? null, email: cart.email ?? null }),
  ])
  return buildPromotionContext({
    cart: cart as Parameters<typeof buildPromotionContext>[0]["cart"],
    action: toAction(action),
    promo_codes: codes,
    known,
    tierGroups,
    customer: {
      id: cart.customer?.id ?? cart.customer_id ?? null,
      group_ids: (cart.customer?.groups ?? []).filter((g): g is { id: string } => !!g).map((g) => g.id),
      first_order: firstOrder,
    },
  })
}

/**
 * `completeCartWorkflow.hooks.validate`: checks every coupon the customer
 * entered once more before the order is placed: per-customer limit, first
 * order, audience, exclusivity, dates. Core does not re-check these at
 * completion, and another order may have been placed in the meantime.
 */
export async function validateCompleteCart(
  { cart }: { input?: unknown; cart: CartForCheck },
  { container }: HookContext
): Promise<void> {
  if (!(await resolveCoupons(container).isEnabled())) return
  // A retried completion of a cart that already became an order must not
  // count that order against the customer.
  if (cart.completed_at) return

  const onCart = codesOnCart(cart)
  const entered = enteredOnCart(cart)
  if (!onCart.length && !entered.length) return
  const known = await loadKnownPromotions(container, onCart)
  const withPromotions: CartForCheck = { ...cart, promotions: onCart.map((code) => ({ code })) }

  const toCheck = new Set<string>(entered)
  for (const code of onCart) {
    const coupon = known.get(code)?.coupon
    if (!coupon || !coupon.coupons_entered) continue
    // Levels of a tiered coupon are checked through the code the customer typed.
    toCheck.add(coupon.coupons_tier != null ? coupon.coupons_group : code)
  }
  for (const code of toCheck) {
    const check = await checkCode(container, withPromotions, code, new Date(), { known })
    if (check.result === "rejected") throw rejection(check.message)
  }
}
