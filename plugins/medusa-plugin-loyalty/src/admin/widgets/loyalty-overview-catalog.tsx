import { defineWidgetConfig } from "@medusajs/admin-sdk"

import { claimZone, OVERVIEW_ZONES } from "../lib/loyalty/kit/integrations"
import { CatalogOverview } from "../lib/loyalty/kit/overview"

claimZone(OVERVIEW_ZONES.catalog, "loyalty")

/** "Catalog at a glance" above Medusa's product list, shared by every Bitshaft plugin and rendered once. */
const CatalogOverviewWidget = () => <CatalogOverview owner="loyalty" />

export const config = defineWidgetConfig({ zone: "product.list.before" })

export default CatalogOverviewWidget
