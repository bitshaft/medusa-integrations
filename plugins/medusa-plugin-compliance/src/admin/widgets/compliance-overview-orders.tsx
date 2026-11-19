import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/compliance/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/compliance/kit/integrations"
import { OrdersOverview } from "../lib/compliance/kit/overview"

claimZone(OVERVIEW_ZONES.orders, "compliance")

/** "Orders to handle" above Medusa's order list, shared by every Bitshaft plugin and rendered once. */
const OrdersOverviewWidget = () => <OrdersOverview owner="compliance" />

export const config = defineWidgetConfig({
  zone: "order.list.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-order-list",
})

export default OrdersOverviewWidget
