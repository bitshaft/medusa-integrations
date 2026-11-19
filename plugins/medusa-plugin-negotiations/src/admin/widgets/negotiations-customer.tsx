import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { ChatBubbleLeftRight } from "@medusajs/icons"

import { ThreadList } from "../components/negotiations/thread-list"
import { useSettings, useThreads } from "../lib/negotiations/api"
import {
  claimZone,
  DETAIL_ZONES,
  DetailIntegrations,
  type EntityLike,
  type Level,
  registerTab,
} from "../lib/negotiations/kit/integrations"

registerTab("customer", {
  id: "negotiations",
  brand: { label: "negotiations.title", icon: ChatBubbleLeftRight, color: "#0891b2" },
  order: 50,
  useState: (customer) => {
    const settings = useSettings()
    const enabled = settings.data?.enabled === true
    const threads = useThreads({ customer_id: customer.id, limit: 1 }, { enabled })
    if (!enabled) return { visible: false, level: "none", loading: settings.isLoading }
    const counts = threads.data?.counts ?? {}
    // Only customers who negotiated get the tab: waiting for the team orange, in progress blue.
    const level: Level = counts.waiting ? "warn" : (counts.open ?? 0) + (counts.countered ?? 0) ? "info" : "none"
    return { visible: Boolean(threads.data?.count), level, loading: threads.isLoading }
  },
  // This customer's negotiations.
  Panel: ({ entity }) => (
    <div className="pt-2">
      <ThreadList fixed={{ customer_id: entity.id }} compact />
    </div>
  ),
})
claimZone(DETAIL_ZONES.customer, "negotiations")

/** The Integrations card at the top of the customer page (rendered by one plugin for all of them). */
const CustomerNegotiationsWidget = ({ data: customer }: DetailWidgetProps<AdminCustomer>) => (
  <DetailIntegrations page="customer" owner="negotiations" entity={customer as unknown as EntityLike} />
)

export const config = defineWidgetConfig({
  zone: "customer.details.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-customer-details",
})

export default CustomerNegotiationsWidget
