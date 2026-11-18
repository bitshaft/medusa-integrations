import { defineWidgetConfig } from "@medusajs/admin-sdk"

import "../lib/whitelist-vat/signals"
import { claimZone, OVERVIEW_ZONES } from "../lib/whitelist-vat/kit/integrations"
import { OrdersOverview } from "../lib/whitelist-vat/kit/overview"

claimZone(OVERVIEW_ZONES.orders, "whitelist-vat")

/** "Orders to handle" above Medusa's order list, shared by every Bitshaft plugin and rendered once. */
const OrdersOverviewWidget = () => <OrdersOverview owner="whitelist-vat" />

export const config = defineWidgetConfig({ zone: "order.list.before" })

export default OrdersOverviewWidget
