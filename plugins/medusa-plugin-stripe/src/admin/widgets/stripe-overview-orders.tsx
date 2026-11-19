import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/stripe/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/stripe/kit/integrations"
import { OrdersOverview } from "../lib/stripe/kit/overview"

claimZone(OVERVIEW_ZONES.orders, "stripe")

/** "Orders to handle" above Medusa's order list, shared by every Bitshaft plugin and rendered once. */
const OrdersOverviewWidget = () => <OrdersOverview owner="stripe" />

export const config = defineWidgetConfig({
  zone: "order.list.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-order-list",
})

export default OrdersOverviewWidget
