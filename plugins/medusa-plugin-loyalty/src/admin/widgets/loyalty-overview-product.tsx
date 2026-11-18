import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"

import { claimZone, type EntityLike, OVERVIEW_ZONES } from "../lib/loyalty/kit/integrations"
import { ProductOverview } from "../lib/loyalty/kit/overview"

claimZone(OVERVIEW_ZONES.product, "loyalty")

/** "Product at a glance" above Medusa's product page, shared by every Bitshaft plugin and rendered once. */
const ProductOverviewWidget = ({ data }: DetailWidgetProps<AdminProduct>) => (
  <ProductOverview owner="loyalty" product={data as unknown as EntityLike} />
)

export const config = defineWidgetConfig({ zone: "product.details.before" })

export default ProductOverviewWidget
