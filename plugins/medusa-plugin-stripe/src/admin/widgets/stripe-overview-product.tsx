import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"

import "../lib/stripe/signals"
import { claimZone, type EntityLike, OVERVIEW_ZONES } from "../lib/stripe/kit/integrations"
import { ProductOverview } from "../lib/stripe/kit/overview"

claimZone(OVERVIEW_ZONES.product, "stripe")

/** "Product at a glance" above Medusa's product page, shared by every Bitshaft plugin and rendered once. */
const ProductOverviewWidget = ({ data }: DetailWidgetProps<AdminProduct>) => (
  <ProductOverview owner="stripe" product={data as unknown as EntityLike} />
)

export const config = defineWidgetConfig({
  zone: "product.details.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-product-details",
})

export default ProductOverviewWidget
