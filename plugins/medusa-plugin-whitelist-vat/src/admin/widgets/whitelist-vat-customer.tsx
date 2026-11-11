import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"

import { RecordPanel } from "../components/whitelist-vat/record-panel"

/** Customer page panel: the tax ID kept on the customer, its verdict and history. */
const WhitelistVatCustomer = ({ data: customer }: DetailWidgetProps<AdminCustomer>) => (
  <RecordPanel kind="customers" id={customer.id} />
)

export const config = defineWidgetConfig({
  zone: "customer.details.after",
})

export default WhitelistVatCustomer
