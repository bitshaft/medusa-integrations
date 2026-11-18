import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/negotiations/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/negotiations/kit/integrations"
import { OrdersOverview } from "../lib/negotiations/kit/overview"

claimZone(OVERVIEW_ZONES.orders, "negotiations")

/** "Orders to handle" above Medusa's order list, shared by every Bitshaft plugin and rendered once. */
const OrdersOverviewWidget = () => <OrdersOverview owner="negotiations" />

export const config = defineWidgetConfig({ zone: "order.list.before" })

export default OrdersOverviewWidget
