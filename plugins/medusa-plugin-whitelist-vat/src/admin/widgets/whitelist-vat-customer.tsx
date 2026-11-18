import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { ShieldCheck } from "@medusajs/icons"

import { RecordPanel } from "../components/whitelist-vat/record-panel"
import { type Status, useRecord, useWhitelistVatStatus } from "../lib/whitelist-vat/api"
import {
  claimZone,
  DETAIL_ZONES,
  DetailIntegrations,
  type EntityLike,
  type Level,
  registerTab,
} from "../lib/whitelist-vat/kit/integrations"

/** An active VAT payer green, exempt blue, anything wrong red, not checked or outdated orange. */
function levelOf(status: Status | undefined, stale: boolean): Level {
  if (!status) return "warn"
  if (["unregistered", "inactive", "invalid", "not_found"].includes(status)) return "error"
  if (status === "unverified" || stale) return "warn"
  return status === "exempt" ? "info" : "ok"
}

registerTab("customer", {
  id: "whitelist-vat",
  brand: { label: "whitelist-vat.title", icon: ShieldCheck, color: "#16a34a" },
  order: 30,
  useState: (customer) => {
    const status = useWhitelistVatStatus()
    const enabled = status.data?.enabled === true
    const record = useRecord("customers", customer.id, enabled)
    if (!enabled) return { visible: false, level: "none", loading: status.isLoading }
    const taxId = record.data?.tax_id ?? null
    // Only customers with a tax ID get the tab.
    if (!taxId) return { visible: false, level: "none", loading: record.isLoading }
    if (!taxId.valid_format) return { visible: true, level: "error" }
    const subject = record.data?.subject ?? null
    return { visible: true, level: levelOf(subject?.status, Boolean(subject?.stale)) }
  },
  // The tax ID kept on the customer, its verdict and history.
  Panel: ({ entity }) => <RecordPanel kind="customers" id={entity.id} bare />,
})
claimZone(DETAIL_ZONES.customer, "whitelist-vat")

/** The Integrations card at the top of the customer page (rendered by one plugin for all of them). */
const WhitelistVatCustomer = ({ data: customer }: DetailWidgetProps<AdminCustomer>) => (
  <DetailIntegrations page="customer" owner="whitelist-vat" entity={customer as unknown as EntityLike} />
)

export const config = defineWidgetConfig({
  zone: "customer.details.before",
})

export default WhitelistVatCustomer
