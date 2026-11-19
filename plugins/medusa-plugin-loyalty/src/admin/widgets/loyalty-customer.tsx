import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { Star } from "@medusajs/icons"

import { CustomerLoyalty } from "../components/loyalty/customers"
import { useCustomer, useSettings } from "../lib/loyalty/api"
import {
  claimZone,
  DETAIL_ZONES,
  DetailIntegrations,
  type EntityLike,
  type Level,
  registerTab,
} from "../lib/loyalty/kit/integrations"

registerTab("customer", {
  id: "loyalty",
  brand: { label: "loyalty.title", icon: Star, color: "#d97706" },
  order: 20,
  useState: (customer) => {
    const settings = useSettings()
    const enabled = settings.data?.enabled === true
    const detail = useCustomer(enabled ? customer.id : null)
    if (!enabled) return { visible: false, level: "none", loading: settings.isLoading }
    const summary = detail.data?.summary
    // Points to spend blue; not a member (guest or excluded group) grey.
    const level: Level = summary && summary.member && summary.balance > 0 ? "info" : "none"
    return { visible: true, level, loading: detail.isLoading }
  },
  // Balance, tier, manual correction and the latest ledger entries.
  Panel: ({ entity }) => (
    <div className="flex flex-col gap-y-4 p-6">
      <CustomerLoyalty customerId={entity.id} compact />
    </div>
  ),
})
claimZone(DETAIL_ZONES.customer, "loyalty")

/** The Integrations card at the top of the customer page (rendered by one plugin for all of them). */
const LoyaltyCustomerWidget = ({ data }: DetailWidgetProps<AdminCustomer>) => (
  <DetailIntegrations page="customer" owner="loyalty" entity={data as unknown as EntityLike} />
)

export const config = defineWidgetConfig({
  zone: "customer.details.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-customer-details",
})

export default LoyaltyCustomerWidget
