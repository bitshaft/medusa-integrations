import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/emails/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/emails/kit/integrations"
import { CatalogOverview } from "../lib/emails/kit/overview"

claimZone(OVERVIEW_ZONES.catalog, "emails")

/** "Catalog at a glance" above Medusa's product list, shared by every Bitshaft plugin and rendered once. */
const CatalogOverviewWidget = () => <CatalogOverview owner="emails" />

export const config = defineWidgetConfig({ zone: "product.list.before" })

export default CatalogOverviewWidget
