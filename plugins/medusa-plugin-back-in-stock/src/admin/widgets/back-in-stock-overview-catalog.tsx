import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/back-in-stock/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/back-in-stock/kit/integrations"
import { CatalogOverview } from "../lib/back-in-stock/kit/overview"

claimZone(OVERVIEW_ZONES.catalog, "back-in-stock")

/** "Catalog at a glance" above Medusa's product list, shared by every Bitshaft plugin and rendered once. */
const CatalogOverviewWidget = () => <CatalogOverview owner="back-in-stock" />

export const config = defineWidgetConfig({ zone: "product.list.before" })

export default CatalogOverviewWidget
