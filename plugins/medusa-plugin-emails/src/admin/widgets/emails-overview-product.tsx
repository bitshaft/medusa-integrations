import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"

import "../lib/emails/signals"
import { claimZone, type EntityLike, OVERVIEW_ZONES } from "../lib/emails/kit/integrations"
import { ProductOverview } from "../lib/emails/kit/overview"

claimZone(OVERVIEW_ZONES.product, "emails")

/** "Product at a glance" above Medusa's product page, shared by every Bitshaft plugin and rendered once. */
const ProductOverviewWidget = ({ data }: DetailWidgetProps<AdminProduct>) => (
  <ProductOverview owner="emails" product={data as unknown as EntityLike} />
)

export const config = defineWidgetConfig({ zone: "product.details.before" })

export default ProductOverviewWidget
