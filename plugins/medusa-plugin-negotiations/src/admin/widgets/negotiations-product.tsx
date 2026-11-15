import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ThreadList } from "../components/negotiations/thread-list"
import { useSettings } from "../lib/negotiations/api"

/** Negotiations about this product (also cart threads that include it). */
const ProductNegotiationsWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const { t } = useTranslation()
  const settings = useSettings()
  if (!settings.data?.enabled) return null
  return (
    <Container className="p-0 pb-2">
      <div className="px-6 pt-4">
        <Heading level="h2">{t("negotiations.widgets.product")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("negotiations.widgets.productHint")}
        </Text>
      </div>
      <div className="pt-2">
        <ThreadList fixed={{ product_id: product.id }} compact />
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "product.details.after" })

export default ProductNegotiationsWidget
