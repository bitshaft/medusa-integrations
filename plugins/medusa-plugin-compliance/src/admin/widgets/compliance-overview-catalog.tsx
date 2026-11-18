import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/compliance/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/compliance/kit/integrations"
import { CatalogOverview } from "../lib/compliance/kit/overview"

claimZone(OVERVIEW_ZONES.catalog, "compliance")

/** "Catalog at a glance" above Medusa's product list, shared by every Bitshaft plugin and rendered once. */
const CatalogOverviewWidget = () => <CatalogOverview owner="compliance" />

export const config = defineWidgetConfig({ zone: "product.list.before" })

export default CatalogOverviewWidget
