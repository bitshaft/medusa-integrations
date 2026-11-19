import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"

import "../lib/back-in-stock/product-tab"
import "../lib/back-in-stock/signals"
import { claimZone, type EntityLike, OVERVIEW_ZONES } from "../lib/back-in-stock/kit/integrations"
import { ProductOverview } from "../lib/back-in-stock/kit/overview"

claimZone(OVERVIEW_ZONES.product, "back-in-stock")

/** "Product at a glance" above Medusa's product page, shared by every Bitshaft plugin and rendered once. */
const ProductOverviewWidget = ({ data }: DetailWidgetProps<AdminProduct>) => (
  <ProductOverview owner="back-in-stock" product={data as unknown as EntityLike} />
)

export const config = defineWidgetConfig({ zone: "product.details.before" })

export default ProductOverviewWidget
