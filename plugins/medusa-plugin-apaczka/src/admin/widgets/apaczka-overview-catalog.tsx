import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/apaczka/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/apaczka/kit/integrations"
import { CatalogOverview } from "../lib/apaczka/kit/overview"

claimZone(OVERVIEW_ZONES.catalog, "apaczka")

/** "Catalog at a glance" above Medusa's product list, shared by every Bitshaft plugin and rendered once. */
const CatalogOverviewWidget = () => <CatalogOverview owner="apaczka" />

export const config = defineWidgetConfig({ zone: "product.list.before" })

export default CatalogOverviewWidget
