import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ThreadList } from "../components/negotiations/thread-list"
import { useSettings } from "../lib/negotiations/api"

/** This customer's negotiations. */
const CustomerNegotiationsWidget = ({ data: customer }: DetailWidgetProps<AdminCustomer>) => {
  const { t } = useTranslation()
  const settings = useSettings()
  if (!settings.data?.enabled) return null
  return (
    <Container className="overflow-hidden p-0 pb-2">
      <div className="px-6 pt-4">
        <Heading level="h2">{t("negotiations.widgets.customer")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("negotiations.widgets.customerHint")}
        </Text>
      </div>
      <div className="pt-2">
        <ThreadList fixed={{ customer_id: customer.id }} compact />
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "customer.details.after" })

export default CustomerNegotiationsWidget
