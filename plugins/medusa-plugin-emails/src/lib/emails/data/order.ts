import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { addressLines, toNumber } from "../format"
import type { EmailLocale } from "../locales"
import type { OrderView } from "../types"

const ORDER_FIELDS = [
  "id",
  "display_id",
  "created_at",
  "email",
  "currency_code",
  "locale",
  "metadata",
  "customer_id",
  "total",
  "tax_total",
  "discount_total",
  "item_total",
  "original_item_total",
  "shipping_total",
  "original_shipping_total",
  "items.id",
  "items.title",
  "items.subtitle",
  "items.product_title",
  "items.variant_title",
  "items.variant_sku",
  "items.thumbnail",
  "items.quantity",
  "items.unit_price",
  "items.total",
  "shipping_address.*",
  "billing_address.*",
  "shipping_methods.name",
  "customer.id",
  "customer.first_name",
  "customer.last_name",
  "customer.metadata",
]

type RawAddress = Parameters<typeof addressLines>[0]

/** An order as `query.graph` returns it; only the fields emails need. */
export type RawOrder = {
  id: string
  display_id?: number | string | null
  created_at?: string | Date | null
  email?: string | null
  currency_code: string
  locale?: string | null
  metadata?: Record<string, unknown> | null
  customer_id?: string | null
  total?: unknown
  tax_total?: unknown
  discount_total?: unknown
  item_total?: unknown
  original_item_total?: unknown
  shipping_total?: unknown
  original_shipping_total?: unknown
  items?: Array<{
    id: string
    title?: string | null
    subtitle?: string | null
    product_title?: string | null
    variant_title?: string | null
    variant_sku?: string | null
    thumbnail?: string | null
    quantity?: unknown
    unit_price?: unknown
    total?: unknown
  } | null> | null
  shipping_address?: RawAddress
  billing_address?: RawAddress
  shipping_methods?: Array<{ name?: string | null } | null> | null
  customer?: {
    id?: string | null
    first_name?: string | null
    last_name?: string | null
    metadata?: Record<string, unknown> | null
  } | null
}

export async function fetchOrder(container: MedusaContainer, orderId: string): Promise<RawOrder | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", filters: { id: orderId }, fields: ORDER_FIELDS })
  return (data[0] as unknown as RawOrder) ?? null
}

/** The most recent orders, for the preview's order picker. */
export async function fetchRecentOrders(container: MedusaContainer, limit = 10) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "created_at"],
    pagination: { take: limit, skip: 0, order: { created_at: "DESC" } },
  })
  return data as unknown as Array<{ id: string; display_id: number; email: string | null; created_at: string }>
}

/** Product title with the variant as a subtitle (unless it says nothing new). */
function itemTitles(item: NonNullable<NonNullable<RawOrder["items"]>[number]>) {
  const title = item.product_title || item.title || ""
  const subtitle = item.variant_title || item.subtitle || null
  const redundant = !subtitle || subtitle === title || /^default( variant)?$/i.test(subtitle)
  return { title, subtitle: redundant ? null : subtitle }
}

export function toOrderView(raw: RawOrder, locale: EmailLocale): OrderView {
  const items = (raw.items ?? []).filter((item): item is NonNullable<typeof item> => Boolean(item))
  return {
    id: raw.id,
    display_id: String(raw.display_id ?? raw.id),
    created_at: raw.created_at ? new Date(raw.created_at).toISOString() : null,
    email: raw.email ?? null,
    currency_code: raw.currency_code,
    country_code: raw.shipping_address?.country_code?.toLowerCase() ?? null,
    customer: {
      id: raw.customer?.id ?? raw.customer_id ?? null,
      first_name: raw.customer?.first_name ?? raw.shipping_address?.first_name ?? null,
      last_name: raw.customer?.last_name ?? raw.shipping_address?.last_name ?? null,
    },
    items: items.map((item) => ({
      ...itemTitles(item),
      sku: item.variant_sku ?? null,
      quantity: toNumber(item.quantity),
      unit_price: toNumber(item.unit_price),
      total: toNumber(item.total),
      thumbnail: item.thumbnail ?? null,
    })),
    subtotal: toNumber(raw.original_item_total ?? raw.item_total),
    shipping_total: toNumber(raw.original_shipping_total ?? raw.shipping_total),
    discount_total: toNumber(raw.discount_total),
    tax_total: toNumber(raw.tax_total),
    total: toNumber(raw.total),
    shipping_address: addressLines(raw.shipping_address, locale),
    billing_address: addressLines(raw.billing_address, locale),
    shipping_methods: (raw.shipping_methods ?? [])
      .map((method) => method?.name?.trim())
      .filter((name): name is string => Boolean(name)),
  }
}

/** Titles of order items by line item ID, for shipments and returns. */
export function itemTitleIndex(raw: RawOrder) {
  const index = new Map<string, { title: string; subtitle: string | null }>()
  for (const item of raw.items ?? []) {
    if (item) {
      index.set(item.id, itemTitles(item))
    }
  }
  return index
}
