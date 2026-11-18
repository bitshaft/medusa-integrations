import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/stripe/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/stripe/kit/integrations"
import { CatalogOverview } from "../lib/stripe/kit/overview"

claimZone(OVERVIEW_ZONES.catalog, "stripe")

/** "Catalog at a glance" above Medusa's product list, shared by every Bitshaft plugin and rendered once. */
const CatalogOverviewWidget = () => <CatalogOverview owner="stripe" />

export const config = defineWidgetConfig({ zone: "product.list.before" })

export default CatalogOverviewWidget
