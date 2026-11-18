import { defineWidgetConfig } from "@medusajs/admin-sdk"

import { claimZone, OVERVIEW_ZONES } from "../lib/coupons/kit/integrations"
import { CatalogOverview } from "../lib/coupons/kit/overview"

claimZone(OVERVIEW_ZONES.catalog, "coupons")

/** "Catalog at a glance" above Medusa's product list, shared by every Bitshaft plugin and rendered once. */
const CatalogOverviewWidget = () => <CatalogOverview owner="coupons" />

export const config = defineWidgetConfig({ zone: "product.list.before" })

export default CatalogOverviewWidget
