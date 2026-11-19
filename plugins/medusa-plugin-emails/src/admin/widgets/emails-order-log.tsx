import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Envelope } from "@medusajs/icons"

import { MessageLog } from "../components/emails/message-log"
import { useEmailMessages, useEmailsStatus } from "../lib/emails/api"
import {
  claimZone,
  type Level,
  ORDER_ZONE,
  OrderIntegrations,
  type OrderLike,
  registerOrderTab,
} from "../lib/emails/kit/integrations"

const PAGE = 5

registerOrderTab({
  id: "emails",
  brand: { label: "emails.title", icon: Envelope, color: "#2563eb" },
  order: 40,
  useState: (order) => {
    const status = useEmailsStatus()
    const enabled = status.data?.enabled === true
    // Same query as the log in the tab, so it is read once.
    const messages = useEmailMessages({ order_id: order.id, limit: PAGE, offset: 0 }, enabled)
    if (!enabled) return { visible: false, level: "none", loading: status.isLoading }
    const list = messages.data?.messages ?? []
    // A failed send is red, one still waiting orange, sent green.
    const level: Level = list.some((m) => m.status === "failed")
      ? "error"
      : list.some((m) => m.status === "pending")
        ? "warn"
        : list.length
          ? "ok"
          : "none"
    return { visible: true, level, loading: messages.isLoading }
  },
  // Every email sent for the order, with the option to resend.
  Panel: ({ order }) => <MessageLog orderId={order.id} pageSize={PAGE} />,
})
claimZone(ORDER_ZONE, "emails")

/** The Integrations card at the top of the order page (rendered by one plugin for all of them). */
const EmailsOrderLog = ({ data: order }: DetailWidgetProps<AdminOrder>) => (
  <OrderIntegrations owner="emails" order={order as unknown as OrderLike} />
)

export const config = defineWidgetConfig({
  zone: "order.details.before",
  // Shared by every Bitshaft plugin: one id, so a layout placement holds whichever plugin renders the card.
  id: "bitshaft-integrations-order-details",
})

export default EmailsOrderLog
