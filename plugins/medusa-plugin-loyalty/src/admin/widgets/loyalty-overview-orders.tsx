import { defineWidgetConfig } from "@medusajs/admin-sdk"

import { claimZone, OVERVIEW_ZONES } from "../lib/loyalty/kit/integrations"
import { OrdersOverview } from "../lib/loyalty/kit/overview"

claimZone(OVERVIEW_ZONES.orders, "loyalty")

/** "Orders to handle" above Medusa's order list, shared by every Bitshaft plugin and rendered once. */
const OrdersOverviewWidget = () => <OrdersOverview owner="loyalty" />

export const config = defineWidgetConfig({
  zone: "order.list.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-order-list",
})

export default OrdersOverviewWidget
