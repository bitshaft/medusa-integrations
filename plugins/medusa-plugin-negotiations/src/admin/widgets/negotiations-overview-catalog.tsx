import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/negotiations/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/negotiations/kit/integrations"
import { CatalogOverview } from "../lib/negotiations/kit/overview"

claimZone(OVERVIEW_ZONES.catalog, "negotiations")

/** "Catalog at a glance" above Medusa's product list, shared by every Bitshaft plugin and rendered once. */
const CatalogOverviewWidget = () => <CatalogOverview owner="negotiations" />

export const config = defineWidgetConfig({
  zone: "product.list.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-product-list",
})

export default CatalogOverviewWidget
