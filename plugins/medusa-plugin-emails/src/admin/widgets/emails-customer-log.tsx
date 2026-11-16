import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { MessageLog } from "../components/emails/message-log"
import { useEmailsStatus } from "../lib/emails/api"

/** Customer page panel: every email sent to the customer, with the option to resend. */
const EmailsCustomerLog = ({ data: customer }: DetailWidgetProps<AdminCustomer>) => {
  const { t } = useTranslation()
  const status = useEmailsStatus()

  // Nothing to show while the plugin is not configured; the settings page explains why.
  if (!status.data?.enabled) {
    return null
  }

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("emails.log.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("emails.log.subtitle")}
        </Text>
      </div>
      <MessageLog customerId={customer.id} pageSize={5} />
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.after",
})

export default EmailsCustomerLog
