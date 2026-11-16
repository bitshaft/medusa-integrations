import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { CustomerLoyalty } from "../components/loyalty/customers"

/** On the customer page: balance, tier, manual correction and the latest ledger entries. */
const LoyaltyCustomerWidget = ({ data }: DetailWidgetProps<AdminCustomer>) => {
  const { t } = useTranslation()
  return (
    <Container className="overflow-hidden flex flex-col gap-y-4 px-6 py-4">
      <Heading level="h2">{t("loyalty.widget.title")}</Heading>
      <CustomerLoyalty customerId={data.id} compact />
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "customer.details.after" })

export default LoyaltyCustomerWidget
