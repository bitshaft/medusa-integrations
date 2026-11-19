import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"

import "../lib/whitelist-vat/signals"
import { claimZone, type EntityLike, OVERVIEW_ZONES } from "../lib/whitelist-vat/kit/integrations"
import { ProductOverview } from "../lib/whitelist-vat/kit/overview"

claimZone(OVERVIEW_ZONES.product, "whitelist-vat")

/** "Product at a glance" above Medusa's product page, shared by every Bitshaft plugin and rendered once. */
const ProductOverviewWidget = ({ data }: DetailWidgetProps<AdminProduct>) => (
  <ProductOverview owner="whitelist-vat" product={data as unknown as EntityLike} />
)

export const config = defineWidgetConfig({
  zone: "product.details.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-product-details",
})

export default ProductOverviewWidget
