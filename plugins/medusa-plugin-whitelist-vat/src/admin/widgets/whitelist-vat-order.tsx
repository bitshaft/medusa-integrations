import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { ShieldCheck } from "@medusajs/icons"

import { RecordPanel } from "../components/whitelist-vat/record-panel"
import { type Status, useRecord, useWhitelistVatStatus } from "../lib/whitelist-vat/api"
import {
  claimZone,
  type Level,
  ORDER_ZONE,
  OrderIntegrations,
  type OrderLike,
  registerOrderTab,
} from "../lib/whitelist-vat/kit/integrations"

/** An active VAT payer green, exempt blue, anything wrong red, not checked or outdated orange. */
function levelOf(status: Status | undefined, stale: boolean): Level {
  if (!status) return "warn"
  if (["unregistered", "inactive", "invalid", "not_found"].includes(status)) return "error"
  if (status === "unverified" || stale) return "warn"
  return status === "exempt" ? "info" : "ok"
}

registerOrderTab({
  id: "whitelist-vat",
  brand: { label: "whitelist-vat.title", icon: ShieldCheck, color: "#16a34a" },
  order: 30,
  useState: (order) => {
    const status = useWhitelistVatStatus()
    const enabled = status.data?.enabled === true
    const record = useRecord("orders", order.id, enabled)
    if (!enabled) return { visible: false, level: "none", loading: status.isLoading }
    const taxId = record.data?.tax_id ?? null
    // Only orders with a tax ID get the tab.
    if (!taxId) return { visible: false, level: "none", loading: record.isLoading }
    if (!taxId.valid_format) return { visible: true, level: "error" }
    const subject = record.data?.subject ?? null
    return { visible: true, level: levelOf(subject?.status, Boolean(subject?.stale)) }
  },
  // The buyer's tax ID, its verdict and the answers recorded for the order.
  Panel: ({ order }) => <RecordPanel kind="orders" id={order.id} bare />,
})
claimZone(ORDER_ZONE, "whitelist-vat")

/** The Integrations card at the top of the order page (rendered by one plugin for all of them). */
const WhitelistVatOrder = ({ data: order }: DetailWidgetProps<AdminOrder>) => (
  <OrderIntegrations owner="whitelist-vat" order={order as unknown as OrderLike} />
)

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default WhitelistVatOrder
