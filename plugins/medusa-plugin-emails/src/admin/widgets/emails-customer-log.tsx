import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { Envelope } from "@medusajs/icons"

import { MessageLog } from "../components/emails/message-log"
import { useEmailMessages, useEmailsStatus } from "../lib/emails/api"
import {
  claimZone,
  DETAIL_ZONES,
  DetailIntegrations,
  type EntityLike,
  type Level,
  registerTab,
} from "../lib/emails/kit/integrations"

const PAGE = 5

registerTab("customer", {
  id: "emails",
  brand: { label: "emails.title", icon: Envelope, color: "#2563eb" },
  order: 40,
  useState: (customer) => {
    const status = useEmailsStatus()
    const enabled = status.data?.enabled === true
    // Same query as the log in the tab, so it is read once.
    const messages = useEmailMessages({ customer_id: customer.id, limit: PAGE, offset: 0 }, enabled)
    if (!enabled) return { visible: false, level: "none", loading: status.isLoading }
    const list = messages.data?.messages ?? []
    const level: Level = list.some((m) => m.status === "failed")
      ? "error"
      : list.some((m) => m.status === "pending")
        ? "warn"
        : list.length
          ? "ok"
          : "none"
    return { visible: true, level, loading: messages.isLoading }
  },
  // Every email sent to the customer, with the option to resend.
  Panel: ({ entity }) => <MessageLog customerId={entity.id} pageSize={PAGE} />,
})
claimZone(DETAIL_ZONES.customer, "emails")

/** The Integrations card at the top of the customer page (rendered by one plugin for all of them). */
const EmailsCustomerLog = ({ data: customer }: DetailWidgetProps<AdminCustomer>) => (
  <DetailIntegrations page="customer" owner="emails" entity={customer as unknown as EntityLike} />
)

export const config = defineWidgetConfig({
  zone: "customer.details.before",
})

export default EmailsCustomerLog
