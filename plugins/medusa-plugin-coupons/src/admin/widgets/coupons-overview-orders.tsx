import { defineWidgetConfig } from "@medusajs/admin-sdk"

import { claimZone, OVERVIEW_ZONES } from "../lib/coupons/kit/integrations"
import { OrdersOverview } from "../lib/coupons/kit/overview"

claimZone(OVERVIEW_ZONES.orders, "coupons")

/** "Orders to handle" above Medusa's order list, shared by every Bitshaft plugin and rendered once. */
const OrdersOverviewWidget = () => <OrdersOverview owner="coupons" />

export const config = defineWidgetConfig({ zone: "order.list.before" })

export default OrdersOverviewWidget
