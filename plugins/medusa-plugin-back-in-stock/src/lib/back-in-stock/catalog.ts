import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import type { ProductInfo } from "./links"

type RawVariant = {
  id: string
  title?: string | null
  sku?: string | null
  product_id?: string | null
  product?: { id?: string | null; title?: string | null; handle?: string | null; thumbnail?: string | null } | null
}

/** Titles, handle and image of variants, for emails and the admin. */
export async function loadProducts(
  container: MedusaContainer,
  variantIds: string[]
): Promise<Map<string, ProductInfo>> {
  const ids = [...new Set(variantIds)]
  if (!ids.length) {
    return new Map()
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "sku", "product_id", "product.id", "product.title", "product.handle", "product.thumbnail"],
    filters: { id: ids },
  })
  return new Map(
    (data as unknown as RawVariant[]).map((variant) => [
      variant.id,
      {
        variant_id: variant.id,
        variant_title: variant.title ?? null,
        sku: variant.sku ?? null,
        product_id: variant.product?.id ?? variant.product_id ?? null,
        product_title: variant.product?.title?.trim() || variant.title?.trim() || variant.id,
        handle: variant.product?.handle ?? null,
        thumbnail: variant.product?.thumbnail ?? null,
      },
    ])
  )
}

let storeNameCache: { value: string; expires: number } | undefined

/** The store's name in Medusa, cached for a minute. */
export async function loadStoreName(container: MedusaContainer): Promise<string> {
  if (storeNameCache && storeNameCache.expires > Date.now()) {
    return storeNameCache.value
  }
  let value = "Store"
  try {
    const [store] = await container.resolve(Modules.STORE).listStores({}, { select: ["name"], take: 1 })
    value = store?.name?.trim() || value
  } catch {
    // The store module is optional for this plugin; a generic name is used instead.
  }
  storeNameCache = { value, expires: Date.now() + 60_000 }
  return value
}
