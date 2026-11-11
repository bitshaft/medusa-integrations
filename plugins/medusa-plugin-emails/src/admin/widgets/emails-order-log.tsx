import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { MessageLog } from "../components/emails/message-log"
import { useEmailsStatus } from "../lib/emails/api"

/** Order page panel: every email sent for the order, with the option to resend. */
const EmailsOrderLog = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const { t } = useTranslation()
  const status = useEmailsStatus()

  // Nothing to show while the plugin is not configured; the settings page explains why.
  if (!status.data?.enabled) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("emails.log.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("emails.log.subtitle")}
        </Text>
      </div>
      <MessageLog orderId={order.id} pageSize={5} />
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default EmailsOrderLog
