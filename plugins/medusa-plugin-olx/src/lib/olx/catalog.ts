import type { IInventoryService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, getVariantAvailability, Modules } from "@medusajs/framework/utils"

import type { AdvertAttribute, AdvertInput, StoreDefaults } from "./types"
import { isPublicImageUrl, plainText } from "./validation"

type RawPrice = {
  amount?: unknown
  currency_code?: string | null
  min_quantity?: unknown
  max_quantity?: unknown
  rules_count?: number | null
  price_list_id?: string | null
}
type RawVariant = {
  id: string
  title?: string | null
  sku?: string | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  prices?: RawPrice[] | null
}
type RawProduct = {
  id: string
  title: string
  subtitle?: string | null
  description?: string | null
  thumbnail?: string | null
  images?: Array<{ url?: string | null; rank?: number | null } | null> | null
  variants?: RawVariant[] | null
}

export type VariantDraft = {
  variant_id: string
  variant_title: string | null
  sku: string | null
  store_price: string | null
  in_stock: boolean | null
  stock_managed: boolean
  draft: AdvertInput
}

export type ProductDraft = {
  product_id: string
  title: string
  thumbnail: string | null
  images: Array<{ url: string; usable: boolean }>
  variants: VariantDraft[]
}

/** The store's regular PLN price: no price list, rules or quantity tiers. */
export function regularPln(prices: RawPrice[] | null | undefined): string | null {
  const price = (prices ?? []).find(
    (row) =>
      row?.currency_code?.toLowerCase() === "pln" &&
      !row.price_list_id &&
      !row.rules_count &&
      row.min_quantity == null &&
      row.max_quantity == null
  )
  if (price?.amount === undefined || price.amount === null) {
    return null
  }
  const amount = Number(String(price.amount))
  return Number.isFinite(amount) ? amount.toFixed(2) : null
}

const isDefaultTitle = (title: string | null | undefined) => !title || /^default( variant| title)?$/i.test(title.trim())

/** The advert title: the product, and the variant when there is a choice of them. */
export function draftTitle(product: string, variant: string | null | undefined, variantCount: number): string {
  const name = product.trim()
  return (variantCount > 1 && !isDefaultTitle(variant) ? `${name} ${String(variant).trim()}` : name).slice(0, 150)
}

/** The product's images in order, cover first, without repeats. */
export function productImages(product: RawProduct): string[] {
  const ranked = [...(product.images ?? [])]
    .filter((image): image is { url: string; rank?: number | null } => Boolean(image?.url))
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((image) => image.url)
  return [...new Set([...(product.thumbnail ? [product.thumbnail] : []), ...ranked])]
}

/** A form filled from the product and the store's defaults. */
export function buildDraft(
  product: RawProduct,
  variant: RawVariant,
  defaults: StoreDefaults,
  attributes: AdvertAttribute[] = []
): AdvertInput {
  const count = product.variants?.length ?? 1
  return {
    title: draftTitle(product.title, variant.title, count),
    description: plainText(product.description || product.subtitle),
    price: regularPln(variant.prices) ?? "",
    negotiable: defaults.negotiable,
    category_id: defaults.category_id ?? 0,
    attributes,
    images: productImages(product).filter(isPublicImageUrl).slice(0, 8),
    city_id: defaults.city_id ?? 0,
    district_id: defaults.district_id,
    contact_name: defaults.contact_name,
    contact_phone: defaults.contact_phone || null,
    advertiser_type: defaults.advertiser_type,
  }
}

const PRODUCT_FIELDS = [
  "id",
  "title",
  "subtitle",
  "description",
  "thumbnail",
  "images.url",
  "images.rank",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.prices.*",
]

async function readProducts(container: MedusaContainer, ids: string[]): Promise<RawProduct[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: PRODUCT_FIELDS, filters: { id: ids } })
  return data as unknown as RawProduct[]
}

/** A product with a ready advert form per variant; `null` when it does not exist. */
export async function loadProductDraft(
  container: MedusaContainer,
  productId: string,
  defaults: StoreDefaults
): Promise<ProductDraft | null> {
  const [product] = await readProducts(container, [productId])
  if (!product) {
    return null
  }
  const variants = product.variants ?? []
  const stock = await loadAvailability(
    container,
    variants.map((variant) => variant.id)
  )
  return {
    product_id: product.id,
    title: product.title,
    thumbnail: product.thumbnail ?? null,
    images: productImages(product).map((url) => ({ url, usable: isPublicImageUrl(url) })),
    variants: variants.map((variant) => ({
      variant_id: variant.id,
      variant_title: isDefaultTitle(variant.title) ? null : (variant.title ?? null),
      sku: variant.sku ?? null,
      store_price: regularPln(variant.prices),
      in_stock: stock.get(variant.id) ?? null,
      stock_managed: variant.manage_inventory !== false,
      draft: buildDraft(product, variant, defaults),
    })),
  }
}

/** Forms for many variants at once, for publishing a selection with shared settings. */
export async function loadVariantDrafts(
  container: MedusaContainer,
  variantIds: string[],
  defaults: StoreDefaults,
  attributes: AdvertAttribute[]
): Promise<Array<{ variant_id: string; product_id: string; draft: AdvertInput }>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product_id"],
    filters: { id: variantIds },
  })
  const links = data as unknown as Array<{ id: string; product_id: string }>
  const products = await readProducts(container, [...new Set(links.map((link) => link.product_id))])
  const out: Array<{ variant_id: string; product_id: string; draft: AdvertInput }> = []
  for (const link of links) {
    const product = products.find((row) => row.id === link.product_id)
    const variant = product?.variants?.find((row) => row.id === link.id)
    if (product && variant) {
      out.push({
        variant_id: link.id,
        product_id: product.id,
        draft: buildDraft(product, variant, defaults, attributes),
      })
    }
  }
  return out
}

type AvailabilityVariant = {
  id: string
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  product?: { sales_channels?: Array<{ id: string } | null> | null } | null
}

/**
 * Can each variant still be bought in the store, in any of its product's
 * sales channels? `null` when that cannot be told (no sales channel).
 */
export async function loadAvailability(
  container: MedusaContainer,
  variantIds: string[]
): Promise<Map<string, boolean | null>> {
  const ids = [...new Set(variantIds)]
  const out = new Map<string, boolean | null>()
  if (!ids.length) {
    return out
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "manage_inventory", "allow_backorder", "product.sales_channels.id"],
    filters: { id: ids },
  })
  const variants = data as unknown as AvailabilityVariant[]
  const byChannel = new Map<string, string[]>()
  for (const id of ids) {
    const variant = variants.find((row) => row.id === id)
    if (!variant) {
      // The variant was deleted: there is nothing left to sell.
      out.set(id, false)
      continue
    }
    if (variant.manage_inventory === false || variant.allow_backorder) {
      out.set(id, true)
      continue
    }
    const channels = (variant.product?.sales_channels ?? []).filter((c): c is { id: string } => Boolean(c?.id))
    if (!channels.length) {
      out.set(id, null)
      continue
    }
    out.set(id, false)
    for (const channel of channels) {
      byChannel.set(channel.id, [...(byChannel.get(channel.id) ?? []), id])
    }
  }
  for (const [channel, channelVariants] of byChannel) {
    const computed = await getVariantAvailability(query, { variant_ids: channelVariants, sales_channel_id: channel })
    for (const id of channelVariants) {
      if (Number(computed[id]?.availability ?? 0) > 0) {
        out.set(id, true)
      }
    }
  }
  return out
}

/** Inventory levels before "Sold on OLX", to put back if the workflow fails. */
export type LevelSnapshot = { inventory_item_id: string; location_id: string; stocked_quantity: number }

/** Leaves only what is reserved for store orders, so the variant cannot be bought any more. */
export async function clearVariantStock(container: MedusaContainer, variantId: string): Promise<LevelSnapshot[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "manage_inventory", "inventory_items.inventory_item_id"],
    filters: { id: variantId },
  })
  const variant = data[0] as unknown as
    | { manage_inventory?: boolean | null; inventory_items?: Array<{ inventory_item_id?: string | null } | null> }
    | undefined
  if (!variant || variant.manage_inventory === false) {
    return []
  }
  const itemIds = (variant.inventory_items ?? [])
    .map((row) => row?.inventory_item_id)
    .filter((id): id is string => Boolean(id))
  if (!itemIds.length) {
    return []
  }
  const inventory = container.resolve<IInventoryService>(Modules.INVENTORY)
  const levels = await inventory.listInventoryLevels({ inventory_item_id: itemIds }, { take: null })
  const changed = levels.filter((level) => Number(level.stocked_quantity) > Number(level.reserved_quantity))
  if (!changed.length) {
    return []
  }
  await inventory.updateInventoryLevels(
    changed.map((level) => ({
      inventory_item_id: level.inventory_item_id,
      location_id: level.location_id,
      stocked_quantity: Number(level.reserved_quantity),
    }))
  )
  return changed.map((level) => ({
    inventory_item_id: level.inventory_item_id,
    location_id: level.location_id,
    stocked_quantity: Number(level.stocked_quantity),
  }))
}

export async function restoreStock(container: MedusaContainer, levels: LevelSnapshot[]): Promise<void> {
  if (levels.length) {
    await container.resolve<IInventoryService>(Modules.INVENTORY).updateInventoryLevels(levels)
  }
}
