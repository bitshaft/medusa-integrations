import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"

import { RecordPanel } from "../components/whitelist-vat/record-panel"

/** Order page panel: the buyer's tax ID, its verdict and the answers recorded for the order. */
const WhitelistVatOrder = ({ data: order }: DetailWidgetProps<AdminOrder>) => (
  <RecordPanel kind="orders" id={order.id} />
)

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default WhitelistVatOrder
