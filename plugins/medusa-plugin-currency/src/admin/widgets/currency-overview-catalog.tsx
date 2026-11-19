import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/currency/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/currency/kit/integrations"
import { CatalogOverview } from "../lib/currency/kit/overview"

claimZone(OVERVIEW_ZONES.catalog, "currency")

/** "Catalog at a glance" above Medusa's product list, shared by every Bitshaft plugin and rendered once. */
const CatalogOverviewWidget = () => <CatalogOverview owner="currency" />

export const config = defineWidgetConfig({ zone: "product.list.before" })

export default CatalogOverviewWidget
