import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { loadProducts } from "../catalog"
import { productLabel } from "../render"

export type VariantLabel = {
  product_id: string | null
  product_title: string
  variant_title: string | null
  label: string
  sku: string | null
  thumbnail: string | null
}

/** Product and variant names for admin lists; missing variants get their ID as label. */
export async function variantLabels(
  container: MedusaContainer,
  variantIds: string[]
): Promise<Record<string, VariantLabel>> {
  const products = await loadProducts(container, variantIds)
  return Object.fromEntries(
    [...new Set(variantIds)].map((id) => {
      const product = products.get(id)
      return [
        id,
        product
          ? {
              product_id: product.product_id,
              product_title: product.product_title,
              variant_title: product.variant_title,
              label: productLabel(product.product_title, product.variant_title),
              sku: product.sku,
              thumbnail: product.thumbnail,
            }
          : { product_id: null, product_title: id, variant_title: null, label: id, sku: null, thumbnail: null },
      ]
    })
  )
}

/** Sales channel names by ID. */
export async function channelNames(container: MedusaContainer, ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)]
  if (!unique.length) {
    return {}
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "sales_channel", fields: ["id", "name"], filters: { id: unique } })
  return Object.fromEntries((data as unknown as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]))
}
