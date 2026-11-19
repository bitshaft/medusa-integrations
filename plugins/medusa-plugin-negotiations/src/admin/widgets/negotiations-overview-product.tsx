import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"

import "../lib/negotiations/product-tab"
import "../lib/negotiations/signals"
import { claimZone, type EntityLike, OVERVIEW_ZONES } from "../lib/negotiations/kit/integrations"
import { ProductOverview } from "../lib/negotiations/kit/overview"

claimZone(OVERVIEW_ZONES.product, "negotiations")

/** "Product at a glance" above Medusa's product page, shared by every Bitshaft plugin and rendered once. */
const ProductOverviewWidget = ({ data }: DetailWidgetProps<AdminProduct>) => (
  <ProductOverview owner="negotiations" product={data as unknown as EntityLike} />
)

export const config = defineWidgetConfig({
  zone: "product.details.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-product-details",
})

export default ProductOverviewWidget
