import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"

import "../lib/compliance/product-tab"
import "../lib/compliance/signals"
import { claimZone, type EntityLike, OVERVIEW_ZONES } from "../lib/compliance/kit/integrations"
import { ProductOverview } from "../lib/compliance/kit/overview"

claimZone(OVERVIEW_ZONES.product, "compliance")

/** "Product at a glance" above Medusa's product page, shared by every Bitshaft plugin and rendered once. */
const ProductOverviewWidget = ({ data }: DetailWidgetProps<AdminProduct>) => (
  <ProductOverview owner="compliance" product={data as unknown as EntityLike} />
)

export const config = defineWidgetConfig({ zone: "product.details.before" })

export default ProductOverviewWidget
