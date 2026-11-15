import type { MedusaContainer } from "@medusajs/framework/types"
import { QueryContext } from "@medusajs/framework/utils"

import { NegotiationError } from "../messages"
import { toMinor } from "../money"
import type { CustomerSnapshot, ThreadLine } from "../types"
import { graph, resolveNegotiations } from "./runtime"

type Row = Record<string, any>

export type CustomerInfo = CustomerSnapshot & {
  id: string
  has_account: boolean
  groups: Array<{ id: string; name: string | null }>
  addresses: Row[]
}

export async function loadCustomer(container: MedusaContainer, id: string): Promise<CustomerInfo | null> {
  const { data } = await graph(container)({
    entity: "customer",
    fields: [
      "id",
      "email",
      "first_name",
      "last_name",
      "company_name",
      "has_account",
      "groups.id",
      "groups.name",
      "addresses.*",
    ],
    filters: { id },
  })
  const c = data[0]
  if (!c) return null
  return {
    id: c.id,
    email: c.email ?? null,
    first_name: c.first_name ?? null,
    last_name: c.last_name ?? null,
    company_name: c.company_name ?? null,
    has_account: Boolean(c.has_account),
    groups: (c.groups ?? []).filter(Boolean).map((g: Row) => ({ id: g.id, name: g.name ?? null })),
    addresses: (c.addresses ?? []).filter(Boolean),
  }
}

/** `allowedCustomerGroups` holds group ids or names; empty lets every signed-in customer in. */
export function inAllowedGroup(customer: Pick<CustomerInfo, "groups">, allowed: string[]): boolean {
  if (!allowed.length) return true
  const wanted = new Set(allowed.map((g) => g.toLowerCase()))
  return customer.groups.some(
    (g) => wanted.has(g.id.toLowerCase()) || (g.name !== null && wanted.has(g.name.toLowerCase()))
  )
}

export const snapshotOf = (c: CustomerInfo): CustomerSnapshot => ({
  email: c.email,
  first_name: c.first_name,
  last_name: c.last_name,
  company_name: c.company_name,
})

/** The store's default currency, used when neither the request nor the options name one. */
export async function storeCurrency(container: MedusaContainer): Promise<string | null> {
  const { data } = await graph(container)({
    entity: "store",
    fields: ["id", "supported_currencies.currency_code", "supported_currencies.is_default"],
  })
  const currencies: Row[] = (data[0]?.supported_currencies ?? []).filter(Boolean)
  return (currencies.find((c) => c.is_default) ?? currencies[0])?.currency_code ?? null
}

export type ProductQuote = {
  line: ThreadLine
  currency_code: string
  region_id: string | null
  /** Whether the catalog price includes tax, as Medusa reported it. */
  price_tax_inclusive: boolean
}

/**
 * The variant with its catalog price for this customer, computed the way
 * the Store API does: region and currency, plus the customer's groups (for
 * price lists). The price is frozen in the thread.
 */
export async function quoteProduct(
  container: MedusaContainer,
  input: {
    variant_id?: string
    product_id?: string
    quantity: number
    region_id?: string
    currency_code?: string
    customer: CustomerInfo
  }
): Promise<ProductQuote> {
  const service = resolveNegotiations(container)
  const options = await service.getOptions()
  const query = graph(container)

  let variantId = input.variant_id
  if (!variantId) {
    if (!input.product_id) throw new NegotiationError("invalid_input", { details: "send variant_id or product_id" })
    const { data } = await query({
      entity: "product",
      fields: ["id", "variants.id"],
      filters: { id: input.product_id },
    })
    const variants = (data[0]?.variants ?? []).filter(Boolean)
    if (!data[0] || !variants.length) throw new NegotiationError("variant_not_found")
    if (variants.length > 1) throw new NegotiationError("product_has_variants")
    variantId = variants[0].id as string
  }

  let regionId = input.region_id ?? null
  let currency = input.currency_code?.toLowerCase() ?? null
  if (regionId) {
    const { data } = await query({ entity: "region", fields: ["id", "currency_code"], filters: { id: regionId } })
    if (!data[0]) throw new NegotiationError("invalid_input", { details: `region ${regionId} does not exist` })
    currency = data[0].currency_code
  }
  currency ??= options.defaultCurrency ?? (await storeCurrency(container))
  if (!currency) throw new NegotiationError("invalid_input", { details: "send currency_code or region_id" })

  const pricing: Record<string, unknown> = {
    currency_code: currency,
    customer: { groups: input.customer.groups.map((g) => ({ id: g.id })) },
  }
  if (regionId) pricing.region_id = regionId

  const { data } = await query({
    entity: "variant",
    fields: [
      "id",
      "title",
      "sku",
      "product.id",
      "product.title",
      "product.thumbnail",
      "product.status",
      "calculated_price.calculated_amount",
      "calculated_price.is_calculated_price_tax_inclusive",
      "calculated_price.currency_code",
    ],
    filters: { id: variantId },
    context: { calculated_price: QueryContext(pricing) },
  })
  const variant = data[0]
  if (!variant || (variant.product && variant.product.status && variant.product.status !== "published")) {
    throw new NegotiationError("variant_not_found")
  }
  const unit = toMinor(variant.calculated_price?.calculated_amount, currency)
  if (unit === null) throw new NegotiationError("price_unavailable", { currency: currency.toUpperCase() })

  return {
    currency_code: currency,
    region_id: regionId,
    price_tax_inclusive: Boolean(variant.calculated_price?.is_calculated_price_tax_inclusive),
    line: {
      variant_id: variant.id,
      product_id: variant.product?.id ?? null,
      product_title: variant.product?.title ?? variant.title ?? variant.id,
      variant_title: variant.title ?? null,
      sku: variant.sku ?? null,
      thumbnail: variant.product?.thumbnail ?? null,
      quantity: input.quantity,
      catalog_unit_price: unit,
    },
  }
}

export type CartRow = {
  id: string
  customer_id: string | null
  currency_code: string
  region_id: string | null
  sales_channel_id: string | null
  completed_at: string | null
  items: Row[]
}

export async function loadCart(container: MedusaContainer, cartId: string): Promise<CartRow | null> {
  const { data } = await graph(container)({
    entity: "cart",
    fields: [
      "id",
      "customer_id",
      "currency_code",
      "region_id",
      "sales_channel_id",
      "completed_at",
      "items.id",
      "items.variant_id",
      "items.product_id",
      "items.product_title",
      "items.variant_title",
      "items.variant_sku",
      "items.thumbnail",
      "items.quantity",
      "items.unit_price",
      "items.is_custom_price",
      "items.metadata",
    ],
    filters: { id: cartId },
  })
  const cart = data[0]
  if (!cart) return null
  return { ...cart, items: (cart.items ?? []).filter(Boolean) } as CartRow
}

/** The customer's own, open cart, or a refusal saying what is wrong. */
export async function customerCart(container: MedusaContainer, cartId: string, customerId: string): Promise<CartRow> {
  const cart = await loadCart(container, cartId)
  if (!cart) throw new NegotiationError("cart_not_found")
  if (cart.customer_id !== customerId) throw new NegotiationError("cart_not_yours")
  if (cart.completed_at) throw new NegotiationError("cart_completed")
  return cart
}

export const NEGOTIATION_METADATA_KEYS = ["negotiation_id", "negotiation_number"] as const

export const isNegotiatedItem = (item: Row) => Boolean(item?.metadata?.negotiation_id)

/**
 * The cart's lines, frozen as a whole-cart thread: quantities and the unit
 * prices the customer saw in the cart at that moment.
 */
export function cartLines(cart: CartRow): ThreadLine[] {
  if (!cart.items.length) throw new NegotiationError("cart_empty")
  if (cart.items.some(isNegotiatedItem)) throw new NegotiationError("cart_has_negotiated_lines")
  const lines = new Map<string, ThreadLine>()
  for (const item of cart.items) {
    if (!item.variant_id) continue
    const unit = toMinor(item.unit_price, cart.currency_code)
    if (unit === null) throw new NegotiationError("price_unavailable", { currency: cart.currency_code.toUpperCase() })
    const existing = lines.get(item.variant_id)
    if (existing && existing.catalog_unit_price === unit) {
      existing.quantity += Number(item.quantity)
      continue
    }
    if (existing) throw new NegotiationError("invalid_input", { details: "the cart holds one variant at two prices" })
    lines.set(item.variant_id, {
      variant_id: item.variant_id,
      product_id: item.product_id ?? null,
      product_title: item.product_title ?? item.variant_id,
      variant_title: item.variant_title ?? null,
      sku: item.variant_sku ?? null,
      thumbnail: item.thumbnail ?? null,
      quantity: Number(item.quantity),
      catalog_unit_price: unit,
    })
  }
  if (!lines.size) throw new NegotiationError("cart_empty")
  return [...lines.values()]
}
